"""
services/inference.py — LightGBM quantile model loader + predictor.
Falls back to a synthetic profile when models are missing.
"""
import pickle
import math
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Tuple

MODELS_ROOT = Path(__file__).parent.parent / "models" / "forecasting"

_LGBM_PATHS = {
    "p10": MODELS_ROOT / "prometheus_lgbm_P10.pkl",
    "p50": MODELS_ROOT / "prometheus_lgbm_P50.pkl",
    "p90": MODELS_ROOT / "prometheus_lgbm_P90.pkl",
}

_models: dict = {}


HOUR_PROFILE = [
    0.52, 0.50, 0.48, 0.47, 0.48, 0.53,
    0.60, 0.72, 0.85, 0.92, 0.96, 0.98,
    1.00, 0.99, 0.97, 0.95, 0.96, 0.98,
    1.02, 1.05, 1.00, 0.90, 0.78, 0.65,
]
DAY_FACTOR  = {0: 1.00, 1: 0.98, 2: 0.99, 3: 1.00, 4: 1.01, 5: 0.88, 6: 0.82}
BASE_MW     = 13_800


def _load_models() -> dict:
    global _models
    if _models:
        return _models
    try:
        if all(p.exists() for p in _LGBM_PATHS.values()):
            for q, path in _LGBM_PATHS.items():
                with open(path, "rb") as f:
                    _models[q] = pickle.load(f)
        else:
            fallback_path = MODELS_ROOT / "adani_lightgbm_model.pkl"
            if fallback_path.exists():
                with open(fallback_path, "rb") as f:
                    model = pickle.load(f)
                _models["p10"] = model
                _models["p50"] = model
                _models["p90"] = model
    except Exception as e:
        print(f"[inference] Model load failed: {e} — using synthetic fallback")
    return _models



def _synthetic(hour: int, weekday: int) -> Tuple[float, float, float]:
    p50 = round(BASE_MW * HOUR_PROFILE[hour % 24] * DAY_FACTOR[weekday % 7], 1)
    return round(p50 * 0.95, 1), p50, round(p50 * 1.05, 1)


# Feature vector order must match training exactly (see routers/model_inference.py)
def _build_feat(row: pd.Series) -> np.ndarray:
    """
    Builds a 17-feature vector matching the training set.
    """
    get = lambda k, default=0.0: float(row.get(k, default) or default)
    
    # These must match routers/model_inference.py exactly
    hour = int(get("hour"))
    wd   = int(get("day_of_week"))
    
    # Use synthetic baseline for the 'base' feature, NOT actual consumption
    # to avoid leakage and match the trained LightGBM's feature space.
    base_synthetic = BASE_MW * HOUR_PROFILE[hour % 24] * DAY_FACTOR[wd % 7]
    
    lag1   = get("lag_1", base_synthetic)
    lag24  = get("lag_24", base_synthetic)
    lag168 = get("lag_168", base_synthetic)
    
    feat = [
        get("hour_sin"), get("hour_cos"),
        get("month_sin"), get("month_cos"),
        get("day_sin"), get("day_cos"),
        get("hour"), get("day_of_week"), get("month"),
        lag1, lag24, lag168,
        get("roll_mean_24h", base_synthetic), 
        get("roll_std_24h", base_synthetic * 0.02),
        base_synthetic,    # Index 14: Synthetic baseline
        lag1 - lag24,      # Index 15: Lag diff
        0.0,               # Index 16: Extra/Padding
    ]
    return np.array([feat])


def predict_quantiles(features_df: pd.DataFrame) -> Tuple[float, float, float]:
    """Return (p10, p50, p90) for a single feature row."""
    models = _load_models()
    row    = features_df.iloc[0]
    hour   = int(row.get("hour", 0))
    wd     = int(row.get("day_of_week", 0))

    if not models:
        return _synthetic(hour, wd)

    try:
        feat = _build_feat(row)
        p50 = float(models["p50"].predict(feat)[0]) if "p50" in models else None
        p10 = float(models["p10"].predict(feat)[0]) if "p10" in models else None
        p90 = float(models["p90"].predict(feat)[0]) if "p90" in models else None

        if p50 is None or not math.isfinite(p50):
            return _synthetic(hour, wd)

        # Sanity clamp to realistic Maharashtra range
        p50 = max(5_000, min(25_000, p50))
        p10 = max(4_000, min(p50, p10 or p50 * 0.95))
        p90 = max(p50,   min(26_000, p90 or p50 * 1.05))
        return round(p10, 1), round(p50, 1), round(p90, 1)
    except Exception as e:
        print(f"[inference] Predict failed: {e} — using synthetic")
        return _synthetic(hour, wd)
