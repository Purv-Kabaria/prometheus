"""
services/features.py — Feature Engineering Pipeline
Reads the Adani hourly xlsx and engineers features that match the LightGBM training set.
"""
import numpy as np
import pandas as pd
from pathlib import Path

DATA_PATH = Path(__file__).parent.parent / "Adani_Datasets" / "hourly_consumption.xlsx"

_df_cache: pd.DataFrame | None = None


def load_and_preprocess_data(force: bool = False) -> pd.DataFrame:
    """Load & cache the Adani hourly dataset with a normalised index."""
    global _df_cache
    if _df_cache is not None and not force:
        return _df_cache

    df = pd.read_excel(DATA_PATH)

    # ── normalise column names ─────────────────────────────────────────────
    col_map = {}
    for c in df.columns:
        low = c.lower()
        if "start" in low or "timestamp" in low or "date" in low and "end" not in low:
            col_map[c] = "timestamp"
        if "consumption" in low or "electricity" in low or "mwh" in low:
            col_map[c] = "consumption_mwh"
    df.rename(columns=col_map, inplace=True)

    # Fallback: first col = timestamp, second = value
    if "timestamp" not in df.columns:
        df.rename(columns={df.columns[0]: "timestamp"}, inplace=True)
    if "consumption_mwh" not in df.columns:
        df.rename(columns={df.columns[1]: "consumption_mwh"}, inplace=True)

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df.set_index("timestamp", inplace=True)
    df["consumption_mwh"] = pd.to_numeric(df["consumption_mwh"], errors="coerce")
    df.sort_index(inplace=True)

    _df_cache = df
    return df


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build the feature matrix expected by the LightGBM quantile models.
    Feature order must match training: see routers/model_inference.py _lgbm_features().
    """
    df = df.copy()

    # Calendar
    df["hour"]        = df.index.hour
    df["day_of_week"] = df.index.dayofweek
    df["month"]       = df.index.month

    # Cyclic encodings
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    df["month_sin"] = np.sin(2 * np.pi * df["month"] / 12)
    df["month_cos"] = np.cos(2 * np.pi * df["month"] / 12)
    df["day_sin"]  = np.sin(2 * np.pi * df["day_of_week"] / 7)
    df["day_cos"]  = np.cos(2 * np.pi * df["day_of_week"] / 7)

    # Lag features
    df["lag_1"]   = df["consumption_mwh"].shift(1)
    df["lag_24"]  = df["consumption_mwh"].shift(24)
    df["lag_168"] = df["consumption_mwh"].shift(168)

    # Rolling stats (shift-1 to avoid leakage)
    shifted = df["consumption_mwh"].shift(1)
    df["roll_mean_24h"] = shifted.rolling(24).mean()
    df["roll_std_24h"]  = shifted.rolling(24).std().fillna(0)

    # Diff
    df["diff_1h"] = df["lag_1"] - df["lag_24"]

    return df
