"""
routes/live.py — GET /api/live-comparison
Returns actual vs predicted consumption for the last N hours,
backed by the SQLite predictions store (populated by the seeding script).
"""
from fastapi import APIRouter, Query
import pandas as pd
import numpy as np

from services.storage import get_recent_history, log_prediction, DB_PATH
from services.features import load_and_preprocess_data, engineer_features
from services.inference import predict_quantiles

router = APIRouter(prefix="/api/live-comparison", tags=["Operational Intelligence"])


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

@router.get("")
def get_live_comparison(hours: int = Query(default=24, ge=1, le=168)):
    """
    Returns hourly actual vs P10/P50/P90 predicted consumption.
    Auto-backfills from the Adani dataset when the store is sparse.
    """
    history = get_recent_history(hours)

    if len(history) < min(hours, 6):          # fewer than 6 rows → seed
        _backfill(max(hours, 168))            # seed at least a week
        history = get_recent_history(hours)

    records = history.replace({np.nan: None}).to_dict(orient="records")
    return {"data": records, "summary": _make_summary(history)}
