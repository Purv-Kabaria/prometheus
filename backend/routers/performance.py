"""
routes/performance.py — Model Performance Tracker
GET /api/model/performance  — MAE/RMSE/MAPE for 7d / 30d / 90d windows
GET /api/model/performance/trend — weekly bucketed metrics for the trend chart
"""
from fastapi import APIRouter
import pandas as pd
import numpy as np
import sqlite3
from pathlib import Path

router = APIRouter(prefix="/api/model/performance", tags=["Operational Intelligence"])

DB_PATH = Path(__file__).parent.parent / "data" / "predictions.db"


# ── pure helpers ──────────────────────────────────────────────────────────────

from .model_inference import predict_hourly
from fastapi import Query

def _load_window(days: int, model: str = "default") -> pd.DataFrame:
    if not DB_PATH.exists():
        return pd.DataFrame()
    conn = sqlite3.connect(DB_PATH)
    max_ts_query = pd.read_sql_query("SELECT MAX(timestamp) as max_ts FROM predictions", conn)
    if max_ts_query.empty or max_ts_query.iloc[0]["max_ts"] is None:
        conn.close()
        return pd.DataFrame()
    
    max_ts = max_ts_query.iloc[0]["max_ts"]

    df = pd.read_sql_query(
        f"""
        SELECT * FROM predictions
        WHERE timestamp >= date('{max_ts}', '-{days} days')
          AND actual IS NOT NULL
        """,
        conn,
    )
    conn.close()
    
    if df.empty:
        return df

    if model != "default":
        # Recalculate predictions for the selected model
        p_list = []
        for _, row in df.iterrows():
            ts = pd.to_datetime(row["timestamp"])
            _, p50, _ = predict_hourly(model, ts.hour, ts.weekday())
            p_list.append(p50)
        df["predicted_p50"] = p_list
    else:
        # Filter rows where predicted_p50 is NULL if using default
        df = df[df["predicted_p50"].notnull()]
        
    return df


def _metrics(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"mae": 0.0, "rmse": 0.0, "mape": 0.0, "n": 0}
    a = df["actual"].values.astype(float)
    p = df["predicted_p50"].values.astype(float)
    mask = (a != 0) & np.isfinite(a) & np.isfinite(p)
    a, p = a[mask], p[mask]
    if len(a) == 0:
        return {"mae": 0.0, "rmse": 0.0, "mape": 0.0, "n": 0}
    mae  = float(np.mean(np.abs(a - p)))
    rmse = float(np.sqrt(np.mean((a - p) ** 2)))
    mape = float(np.mean(np.abs((a - p) / a)) * 100)
    return {"mae": round(mae, 2), "rmse": round(rmse, 2), "mape": round(mape, 2), "n": len(a)}


def _drift(m7: dict, m90: dict) -> tuple[str, str]:
    if m90["mae"] == 0:
        return "stable", "Insufficient historical data to detect drift."
    ratio = m7["mae"] / m90["mae"] if m90["mae"] else 1
    if ratio > 1.5:
        return "drifting", f"⚠️ MAE increased {round((ratio-1)*100,1)}% vs 90-day avg. Retraining recommended."
    if ratio > 1.2:
        return "warning", f"Slight degradation ({round((ratio-1)*100,1)}% above baseline). Monitor closely."
    return "stable", "✅ No drift detected. Model retraining not needed."


def _weekly_trend(model: str = "default") -> list:
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        """
        SELECT * FROM predictions
        WHERE actual IS NOT NULL
        ORDER BY timestamp
        """,
        conn,
    )
    conn.close()
    if df.empty:
        return []
    
    if model != "default":
        p_list = []
        for _, row in df.iterrows():
            ts = pd.to_datetime(row["timestamp"])
            _, p50, _ = predict_hourly(model, ts.hour, ts.weekday())
            p_list.append(p50)
        df["predicted_p50"] = p_list
    else:
        df = df[df["predicted_p50"].notnull()]

    if df.empty:
        return []

    df["ts"] = pd.to_datetime(df["timestamp"])
    df["week"] = df["ts"].dt.strftime("W%V")
    rows = []
    for week, grp in df.groupby("week"):
        m = _metrics(grp)
        rows.append({"week": week, **{k: m[k] for k in ("mae", "rmse", "mape")}})
    return rows[-13:]


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
def get_performance(model: str = Query(default="default")):
    df7  = _load_window(7, model)
    df30 = _load_window(30, model)
    df90 = _load_window(90, model)
    m7, m30, m90 = _metrics(df7), _metrics(df30), _metrics(df90)
    drift_status, drift_msg = _drift(m7, m90)
    return {
        "current": {"7d": m7, "30d": m30, "90d": m90},
        "drift_status": drift_status,
        "drift_message": drift_msg,
        "trend": _weekly_trend(model),
    }


@router.get("/trend")
def get_trend(model: str = Query(default="default")):
    return {"trend": _weekly_trend(model)}

