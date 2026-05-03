"""
routers/forecast.py — Prometheus Forecasting & Prediction API
=============================================================
Serves five key prediction products consumed by the Forecasting dashboard:

  GET /api/forecast/models      — Lists all available models + load status
  GET /api/forecast/24h         — Hourly demand predictions for next 24 hours
  GET /api/forecast/7day        — Rolling daily forecast for next 7 days
  GET /api/forecast/peak-hours  — Top-3 demand spike hours per day
  GET /api/forecast/offpeak     — Low-demand curtailment/storage windows

All endpoints accept an optional ?model= query parameter:
  model=synthetic   (default) — deterministic Maharashtra profile
  model=lgbm        — LightGBM P10/P50/P90 quantile ensemble
  model=tcn_xgb     — TCN + XGBoost final submission (1.54% MAPE, Gujarat)
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Query
from .model_inference import predict_hourly, get_model_registry, MODEL_STATUS, BASE_MW_MH as BASE_MW

router = APIRouter(prefix="/api/forecast", tags=["Forecasting"])

# ── Shared constants ─────────────────────────────────────────────────────────
HOUR_PROFILE = [
    0.52, 0.50, 0.48, 0.47, 0.48, 0.53,
    0.60, 0.72, 0.85, 0.92, 0.96, 0.98,
    1.00, 0.99, 0.97, 0.95, 0.96, 0.98,
    1.02, 1.05, 1.00, 0.90, 0.78, 0.65,
]
DAY_FACTOR = {0: 1.00, 1: 0.98, 2: 0.99, 3: 1.00, 4: 1.01, 5: 0.88, 6: 0.82}


# ── Model registry ───────────────────────────────────────────────────────────

@router.get("/models")
def list_models():
    """Return metadata and load-status for every available forecast model."""
    return {"models": get_model_registry()}


# ── 24h hourly forecast ──────────────────────────────────────────────────────

@router.get("/24h")
def forecast_24h(
    state: str = "Maharashtra",
    model: str = Query(default="synthetic", description="Model key: synthetic | lgbm | tcn_xgb"),
):
    """
    24-hour-ahead hourly demand forecast updated every hour.
    Returns P10 / P50 / P90 quantile bands, a confidence score,
    and two operational flags per slot (supply_gap, curtailment_risk).
    """
    now = datetime.now(timezone.utc)
    start = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)

    slots = []
    capacity_mw = 16_500  # installed capacity ceiling

    loaded_models = [m["key"] for m in get_model_registry() if m["loaded"]] if model == "all" else [model]
    
    for i in range(24):
        ts = start + timedelta(hours=i)
        h  = ts.hour
        wd = ts.weekday()
        
        if model == "all":
            slot = {
                "hour":       i + 1,
                "timestamp":  ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "label":      ts.strftime("%H:%M"),
                "confidence": round(max(0.72, 0.95 - i * 0.011), 3),
            }
            p50_sum = 0
            for m_key in loaded_models:
                _, p50, _ = predict_hourly(m_key, h, wd)
                slot[f"{m_key}_p50"] = p50
                p50_sum += p50
            
            avg_p50 = round(p50_sum / max(1, len(loaded_models)), 1)
            slot["p50"] = avg_p50
            slot["p10"] = round(avg_p50 * 0.95, 1)
            slot["p90"] = round(avg_p50 * 1.05, 1)
            slot["supply_gap"] = slot["p90"] > capacity_mw * 0.92
            slot["low_demand"] = avg_p50 < BASE_MW * 0.58
            slots.append(slot)
        else:
            p10, p50, p90 = predict_hourly(model, h, wd)
            conf_boost = 0.02 if model in ("lgbm", "tcn_xgb") and MODEL_STATUS.get(model, {}).get("loaded") else 0.0
            confidence = round(max(0.72, 0.97 + conf_boost - i * 0.011), 3)

            slots.append({
                "hour":       i + 1,
                "timestamp":  ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "label":      ts.strftime("%H:%M"),
                "p10":        p10,
                "p50":        p50,
                "p90":        p90,
                "confidence": confidence,
                "supply_gap": p90 > capacity_mw * 0.92,
                "low_demand": p50 < BASE_MW * 0.58,
            })

    p50s = [s["p50"] for s in slots]
    peak_slot   = max(slots, key=lambda s: s["p50"])
    trough_slot = min(slots, key=lambda s: s["p50"])
    avg_conf    = round(sum(s["confidence"] for s in slots) / len(slots) * 100, 1)

    return {
        "state":         state,
        "model":         model,
        "generated_at":  now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "horizon_hours": 24,
        "slots":         slots,
        "summary": {
            "peak_mw":       peak_slot["p50"],
            "peak_hour":     peak_slot["label"],
            "trough_mw":     trough_slot["p50"],
            "trough_hour":   trough_slot["label"],
            "avg_demand_mw": round(sum(p50s) / len(p50s), 1),
            "avg_confidence": avg_conf,
        },
    }


# ── 7-day weekly forecast ────────────────────────────────────────────────────

@router.get("/7day")
def forecast_7day(
    state: str = "Maharashtra",
    model: str = Query(default="synthetic"),
):
    """Rolling 7-day daily demand forecast."""
    now   = datetime.now(timezone.utc)
    today = now.date()
    DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    days  = []

    loaded_models = [m["key"] for m in get_model_registry() if m["loaded"]] if model == "all" else [model]

    for d in range(7):
        dt  = today + timedelta(days=d)
        wd  = dt.weekday()
        hourly_vals = []
        
        day_slot = {}
        for h in range(24):
            if model == "all":
                p50_sum = 0
                for m_key in loaded_models:
                    _, p50, _ = predict_hourly(m_key, h, wd)
                    day_slot.setdefault(f"{m_key}_p50", []).append(p50)
                    p50_sum += p50
                hourly_vals.append(p50_sum / max(1, len(loaded_models)))
            else:
                _, p50, _ = predict_hourly(model, h, wd)
                hourly_vals.append(p50)

        mean_mw    = round(sum(hourly_vals) / 24, 1)
        peak_mw    = max(hourly_vals)
        trough_mw  = min(hourly_vals)
        peak_hour  = hourly_vals.index(peak_mw)
        trough_hour = hourly_vals.index(trough_mw)

        maint_score  = round(1.0 - DAY_FACTOR[wd], 2)
        units_needed = math.ceil(peak_mw / 2_500)

        days.append({
            "day":              d,
            "date":             dt.strftime("%Y-%m-%d"),
            "day_name":         DAY_NAMES[wd],
            "weekday":          wd,
            "mean_mw":          mean_mw,
            "peak_mw":          round(peak_mw, 1),
            "trough_mw":        round(trough_mw, 1),
            "peak_hour":        f"{peak_hour:02d}:00",
            "trough_hour":      f"{trough_hour:02d}:00",
            "maintenance_score": maint_score,
            "maintenance_ok":   maint_score >= 0.10,
            "units_needed":     units_needed,
            "procurement_flag": mean_mw > BASE_MW * 0.97,
        })

    best_maint = max(days, key=lambda d: d["maintenance_score"])

    return {
        "state":         state,
        "model":         model,
        "generated_at":  now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "horizon_days":  7,
        "days":          days,
        "summary": {
            "best_maintenance_day":  best_maint["day_name"],
            "best_maintenance_date": best_maint["date"],
            "procurement_days":      [d["day_name"] for d in days if d["procurement_flag"]],
            "max_units_needed":      max(d["units_needed"] for d in days),
        },
    }


# ── Peak hour prediction ─────────────────────────────────────────────────────

@router.get("/peak-hours")
def forecast_peak_hours(
    state: str = "Maharashtra",
    days:  int = Query(default=1, ge=1, le=7),
    model: str = Query(default="synthetic"),
):
    """Identifies top-3 demand spike hours for each of the next `days` days."""
    now   = datetime.now(timezone.utc)
    today = now.date()
    results = []

    loaded_models = [m["key"] for m in get_model_registry() if m["loaded"]] if model == "all" else [model]

    for d in range(days):
        dt  = today + timedelta(days=d)
        wd  = dt.weekday()
        hourly = []
        for h in range(24):
            if model == "all":
                p50_sum = 0
                for m_key in loaded_models:
                    _, p50, _ = predict_hourly(m_key, h, wd)
                    p50_sum += p50
                hourly.append((h, p50_sum / max(1, len(loaded_models))))
            else:
                _, p50, _ = predict_hourly(model, h, wd)
                hourly.append((h, p50))
        top3 = sorted(hourly, key=lambda x: x[1], reverse=True)[:3]

        results.append({
            "date":     dt.strftime("%Y-%m-%d"),
            "day_name": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][wd],
            "peaks": [
                {
                    "rank":       i + 1,
                    "hour":       f"{h:02d}:00",
                    "demand_mw":  round(mw, 1),
                    "severity":   "critical" if mw > BASE_MW * 0.99 else
                                  "high"     if mw > BASE_MW * 0.92 else "elevated",
                    "reserve_mw": round(mw * 0.10, 0),
                    "action":     "Pre-stage spinning reserves" if mw > BASE_MW * 0.95 else
                                  "Alert peaker plants",
                }
                for i, (h, mw) in enumerate(top3)
            ],
            "absolute_peak_hour": f"{top3[0][0]:02d}:00",
            "absolute_peak_mw":   round(top3[0][1], 1),
        })

    return {
        "state":        state,
        "model":        model,
        "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "days":         results,
    }


# ── Off-peak window prediction ───────────────────────────────────────────────

@router.get("/offpeak")
def forecast_offpeak(
    state: str = "Maharashtra",
    model: str = Query(default="synthetic"),
):
    """Identifies today's low-demand windows for curtailment / battery charging."""
    now   = datetime.now(timezone.utc)
    today = now.date()
    wd    = today.weekday()

    loaded_models = [m["key"] for m in get_model_registry() if m["loaded"]] if model == "all" else [model]

    hourly = []
    for h in range(24):
        if model == "all":
            p50_sum = 0
            for m_key in loaded_models:
                _, p50, _ = predict_hourly(m_key, h, wd)
                p50_sum += p50
            hourly.append((h, p50_sum / max(1, len(loaded_models))))
        else:
            _, p50, _ = predict_hourly(model, h, wd)
            hourly.append((h, p50))

    daily_peak = max(mw for _, mw in hourly)
    threshold  = daily_peak * 0.60

    windows  = []
    in_window = False
    w_start   = None

    for h, mw in hourly:
        if mw <= threshold:
            if not in_window:
                in_window = True
                w_start   = h
        else:
            if in_window:
                w_end    = h - 1
                seg      = [mw2 for hh, mw2 in hourly if w_start <= hh <= w_end]
                avg_mw   = round(sum(seg) / max(1, len(seg)), 1)
                depth    = round((daily_peak - avg_mw) / daily_peak * 100, 1)
                windows.append({
                    "start_hour": f"{w_start:02d}:00",
                    "end_hour":   f"{w_end:02d}:59",
                    "duration_h": w_end - w_start + 1,
                    "avg_mw":     avg_mw,
                    "depth_pct":  depth,
                    "use_case":   "Battery charging + curtailment" if depth > 40 else "Minor curtailment",
                    "saving_est_mw": round((daily_peak - avg_mw) * 0.4, 0),
                })
                in_window = False

    if in_window:
        w_end  = 23
        seg    = [mw2 for hh, mw2 in hourly if w_start <= hh <= w_end]
        avg_mw = round(sum(seg) / max(1, len(seg)), 1)
        depth  = round((daily_peak - avg_mw) / daily_peak * 100, 1)
        windows.append({
            "start_hour": f"{w_start:02d}:00",
            "end_hour":   "23:59",
            "duration_h": w_end - w_start + 1,
            "avg_mw":     avg_mw,
            "depth_pct":  depth,
            "use_case":   "Battery charging + curtailment" if depth > 40 else "Minor curtailment",
            "saving_est_mw": round((daily_peak - avg_mw) * 0.4, 0),
        })

    total_saving = sum(w["saving_est_mw"] for w in windows)

    return {
        "state":               state,
        "model":               model,
        "date":                today.strftime("%Y-%m-%d"),
        "generated_at":        now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "daily_peak_mw":       round(daily_peak, 1),
        "offpeak_threshold_mw": round(threshold, 1),
        "windows":             windows,
        "summary": {
            "total_windows":       len(windows),
            "longest_window_h":    max((w["duration_h"] for w in windows), default=0),
            "total_offpeak_hours": sum(w["duration_h"] for w in windows),
            "est_saving_mw":       total_saving,
        },
    }
