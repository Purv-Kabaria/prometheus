"""
services/storage.py — SQLite prediction store
"""
import sqlite3
import math
import pandas as pd
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "predictions.db"


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS predictions (
            timestamp     TEXT PRIMARY KEY,
            actual        REAL,
            predicted_p10 REAL,
            predicted_p50 REAL,
            predicted_p90 REAL,
            residual      REAL,
            deviation_pct REAL
        )
    """)
    conn.commit()
    conn.close()


def log_prediction(timestamp: str, actual: float, p10: float, p50: float, p90: float):
    residual  = actual - p50 if (actual is not None and math.isfinite(actual)) else None
    dev_pct   = abs(residual / actual * 100) if (residual is not None and actual != 0) else None
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        INSERT OR REPLACE INTO predictions
          (timestamp, actual, predicted_p10, predicted_p50, predicted_p90, residual, deviation_pct)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (timestamp, actual, p10, p50, p90, residual, dev_pct))
    conn.commit()
    conn.close()


def get_recent_history(hours: int = 24) -> pd.DataFrame:
    if not DB_PATH.exists():
        return pd.DataFrame()
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        f"SELECT * FROM predictions ORDER BY timestamp DESC LIMIT {hours}", conn
    )
    conn.close()
    return df.sort_values("timestamp")


def get_metrics_for_window(days: int = 7) -> pd.DataFrame:
    if not DB_PATH.exists():
        return pd.DataFrame()
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        f"""
        SELECT * FROM predictions
        WHERE timestamp >= datetime('now', '-{days} days')
          AND actual IS NOT NULL
        """,
        conn,
    )
    conn.close()
    return df


def row_count() -> int:
    if not DB_PATH.exists():
        return 0
    conn = sqlite3.connect(DB_PATH)
    n = conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
    conn.close()
    return n
