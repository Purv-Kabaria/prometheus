"""
routes/live.py — GET /api/live-comparison
Returns actual vs predicted consumption for the last N hours,
backed by the SQLite predictions store (populated by the seeding script).
"""
from fastapi import APIRouter, Query
import pandas as pd
import numpy as np
import json
from pathlib import Path
from datetime import datetime

from services.storage import get_recent_history, log_prediction, DB_PATH
from services.features import load_and_preprocess_data, engineer_features
from services.inference import predict_quantiles

router = APIRouter(prefix="/api/live-comparison", tags=["Operational Intelligence"])

_EQUIPMENT_JSON = Path(__file__).parent.parent / "data" / "equipment.json"

@router.get("/equipment")
def get_equipment_status():
    """Return all grid equipment with live maintenance health scores."""
    try:
        with open(_EQUIPMENT_JSON) as f:
            equipment = json.load(f)
    except Exception:
        return {"equipment": []}

    today = datetime.now().date()
    for eq in equipment:
        last      = datetime.strptime(eq["last_maintained"], "%Y-%m-%d").date()
        days_since = (today - last).days
        interval   = eq["maintenance_interval_days"]
        eq["days_since_last_maintenance"] = days_since
        eq["overdue"]    = days_since > interval
        eq["status"]     = "needs_maintenance" if eq["overdue"] else "active"
        # health_pct = 100 when just maintained, 0 when overdue by a full interval
        eq["health_pct"] = max(0, round(100 * (1 - days_since / interval), 1))
    return {"equipment": equipment}



# ── helpers ───────────────────────────────────────────────────────────────────

def _backfill(hours: int):
    """Populate the DB from the Adani hourly xlsx if it is sparse."""
    df = load_and_preprocess_data()
    df = engineer_features(df)
    recent = df.dropna(subset=["lag_1", "lag_24"]).tail(hours)
    for ts, row in recent.iterrows():
        p10, p50, p90 = predict_quantiles(pd.DataFrame([row]))
        log_prediction(
            ts.isoformat(),
            float(row["consumption_mwh"]),
            p10, p50, p90,
        )


def _make_summary(history: pd.DataFrame) -> dict:
    if history.empty or "deviation_pct" not in history.columns:
        return {"avg_deviation_pct": 0, "max_deviation": 0, "status": "unknown"}

    vals = history["deviation_pct"].dropna()
    avg = float(vals.mean()) if len(vals) else 0
    mx  = float(vals.max())  if len(vals) else 0
    status = "normal" if avg < 5 else "warning" if avg < 10 else "critical"
    return {
        "avg_deviation_pct": round(avg, 2),
        "max_deviation":     round(mx,  2),
        "status":            status,
    }


# ── endpoint ──────────────────────────────────────────────────────────────────

from .model_inference import predict_hourly, get_model_registry

@router.get("")
def get_live_comparison(
    hours: int = Query(default=24, ge=1, le=168),
    model: str = Query(default="default")
):
    """
    Returns hourly actual vs P10/P50/P90 predicted consumption.
    If a specific model is requested, predictions are recalculated on-the-fly.
    """
    history = get_recent_history(hours)

    if len(history) < min(hours, 6):          # fewer than 6 rows → seed
        _backfill(max(hours, 168))            # seed at least a week
        history = get_recent_history(hours)

    # If a specific model is requested, override predicted_p50
    if model != "default":
        for idx, row in history.iterrows():
            ts = pd.to_datetime(row["timestamp"])
            p10, p50, p90 = predict_hourly(model, ts.hour, ts.weekday())
            history.at[idx, "predicted_p50"] = p50
            history.at[idx, "predicted_p10"] = p10
            history.at[idx, "predicted_p90"] = p90
            
            # Recalculate residual and deviation
            actual = row["actual"]
            if actual is not None and actual > 0:
                history.at[idx, "residual"] = actual - p50
                history.at[idx, "deviation_pct"] = (abs(actual - p50) / actual) * 100

    records = history.replace({np.nan: None}).to_dict(orient="records")
    return {"data": records, "summary": _make_summary(history)}


# ── Live generation breakdown ─────────────────────────────────────────────────

@router.get("/generation")
def get_live_generation():
    """
    Returns real-time committed generation breakdown by source.
    Solar uses a physics-based sine curve. Demand comes from the real forecast.
    Base capacity dynamically reacts to asset health in equipment.json!
    """
    import math as _math
    from datetime import datetime as _dt
    from .forecast import forecast_24h

    now  = _dt.now()
    hour = now.hour
    minute = now.minute

    try:
        forecast_data   = forecast_24h(model="tcn_xgb")
        slots           = forecast_data.get("slots", [])
        current_demand  = slots[0].get("p50", 13800) if slots else 13800
        peak_mw         = forecast_data.get("summary", {}).get("peak_mw", 15000)
    except Exception:
        current_demand, peak_mw = 13800, 15000

    # Dynamically query asset health!
    try:
        eq_status = get_equipment_status()["equipment"]
    except Exception:
        eq_status = []
    
    base_cap = {"Coal Baseload": 0, "Solar Farm": 0, "Wind Farm": 0, "Hydro Plant": 0, "Gas Peaker Plant": 0}
    for eq in eq_status:
        typ = eq.get("type", "")
        if typ in base_cap:
            health = eq.get("health_pct", 100)
            
            # Normal wear and tear drops efficiency from 100% down to 85% linearly
            eff = 0.85 + (0.15 * (health / 100.0))
            
            if eq.get("overdue"):
                # If overdue, safety regulations force a severe derating (40% capacity)
                eff = 0.40
                
            base_cap[typ] += int(eq.get("capacity_mw", 0) * eff)

    coal_capacity  = base_cap["Coal Baseload"] or 6000
    solar_capacity = base_cap["Solar Farm"] or 2500
    wind_capacity  = base_cap["Wind Farm"] or 2000
    hydro_capacity = base_cap["Hydro Plant"] or 2000
    gas_capacity   = base_cap["Gas Peaker Plant"] or 3500

    # Coal baseload — stable with minor fluctuation based on healthy capacity
    coal_output = round(coal_capacity * 0.85 + (minute % 15) * 2)

    # Solar — physically real: zero at night, sine peak at noon
    if 6 <= hour <= 18:
        solar_fraction = max(0.0, _math.sin(_math.pi * (hour - 6) / 12))
        cloud_factor   = 0.80 + (minute % 20) / 100
        solar_output   = round(solar_capacity * solar_fraction * cloud_factor)
    else:
        solar_output = 0

    # Wind — higher at night, deterministic jitter
    wind_base  = 0.40 if (hour < 6 or hour > 20) else 0.28
    wind_jitter = ((hour * 7 + minute * 3) % 20 - 10) / 100
    wind_output = round(wind_capacity * max(0.10, min(0.85, wind_base + wind_jitter)))

    # Hydro — dispatchable
    hydro_output = round(hydro_capacity * (0.60 if 8 <= hour <= 22 else 0.35))

    # Gas peakers fill the gap (target: demand + 8% spinning reserve)
    renewables  = coal_output + solar_output + wind_output + hydro_output
    target      = round(current_demand * 1.08)
    gas_output  = max(0, min(gas_capacity, target - renewables))

    total    = coal_output + solar_output + wind_output + hydro_output + gas_output
    headroom = round(total - current_demand)
    reserve_pct = round(headroom / current_demand * 100, 1) if current_demand else 0.0
    alert = (
        "over_generation" if headroom > current_demand * 0.15 else
        "supply_risk"     if headroom < 0 else
        "normal"
    )

    return {
        "status":               "success",
        "timestamp":            now.strftime("%H:%M:%S"),
        "total_generation_mw":  total,
        "forecast_demand_mw":   current_demand,
        "headroom_mw":          headroom,
        "reserve_margin_pct":   reserve_pct,
        "grid_alert":           alert,
        "generation_mix": {
            "coal_baseload_mw": coal_output,
            "solar_mw":         solar_output,
            "wind_mw":          wind_output,
            "hydro_mw":         hydro_output,
            "gas_peaker_mw":    gas_output,
        },
    }

