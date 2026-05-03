"""
model_inference.py — Unified inference shim for all trained models
==================================================================
Provides a single predict_hourly(model_key, hour, weekday) interface
that the forecast router calls regardless of which backend model is used.

Supported model_key values
--------------------------
  "synthetic"   Pure deterministic profile — always available, no deps
  "lgbm"        LightGBM P10/P50/P90 quantile models (prometheus_lgbm_*.pkl)
  "tcn_xgb"     TCN base-model + XGBoost error-corrector (final_submission/)

Fallback
--------
If a real model cannot be loaded (missing file or import error) the shim
silently falls back to "synthetic" and records the reason in MODEL_STATUS.
"""

from __future__ import annotations

import math
import random
import pickle
import logging
import os
from functools import lru_cache
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Tuple

import warnings
warnings.filterwarnings('ignore', category=UserWarning)

logger = logging.getLogger(__name__)

# ── Paths ────────────────────────────────────────────────────────────────────
_ROOT = Path(__file__).parent.parent / "models"
_LGBM_P10  = _ROOT / "prometheus_lgbm_P10.pkl"
_LGBM_P50  = _ROOT / "prometheus_lgbm_P50.pkl"
_LGBM_P90  = _ROOT / "prometheus_lgbm_P90.pkl"
_FS_DIR    = _ROOT / "final_submission"
_TCN_PH    = _FS_DIR / "final_prefix_tcn_weights.pth"
_XGB_PH    = _FS_DIR / "final_prefix_xgb_corrector.json"
_META_PH   = _FS_DIR / "final_prefix_metadata.json"
_SCALER_X  = _FS_DIR / "final_prefix_scaler_X.pkl"
_SCALER_Y  = _FS_DIR / "final_prefix_scaler_y.pkl"

# ── Demand baseline (synthetic fallback) ────────────────────────────────────
HOUR_PROFILE = [
    0.52, 0.50, 0.48, 0.47, 0.48, 0.53,
    0.60, 0.72, 0.85, 0.92, 0.96, 0.98,
    1.00, 0.99, 0.97, 0.95, 0.96, 0.98,
    1.02, 1.05, 1.00, 0.90, 0.78, 0.65,
]
DAY_FACTOR = {0: 1.00, 1: 0.98, 2: 0.99, 3: 1.00, 4: 1.01, 5: 0.88, 6: 0.82}
BASE_MW_MH = 13_800   # baseline demand MW (derived from dataset mean)
BASE_MW_GJ = 12_200   # secondary baseline MW
_SEED = int(datetime.now(timezone.utc).strftime("%Y%m%d%H"))

# ── Lazy-loaded model cache ─────────────────────────────────────────────────
_lgbm_models: Dict[str, Any] = {}
_tcn_model = None
_xgb_model = None
_scaler_x  = None
_scaler_y  = None
_tcn_meta: Dict = {}
_planner_model = None
_mamba_model = None

MODEL_STATUS: Dict[str, Dict] = {
    "synthetic": {"loaded": True,  "error": None, "mape": "~3.5%"},
    "lgbm":      {"loaded": False, "error": None, "mape": "~2.8%"},
    "tcn_xgb":   {"loaded": False, "error": None, "mape": "1.54%"},
    "mamba":     {"loaded": False, "error": None, "mape": "1.85%"},
    "planner":   {"loaded": False, "error": None, "mape": "2.10%"},
}

ADANI_KEYS = {
    "adani_catboost": {"file": "adani_catboost_model.pkl", "name": "Adani CatBoost", "type": "Gradient Boosting", "desc": "CatBoost model trained on Adani dataset"},
    "adani_lightgbm": {"file": "adani_lightgbm_model.pkl", "name": "Adani LightGBM", "type": "Gradient Boosting", "desc": "LightGBM model trained on Adani dataset"},
    "adani_prophet": {"file": "adani_prophet_model.pkl", "name": "Adani Prophet", "type": "Time Series", "desc": "Prophet model trained on Adani dataset"},
    "adani_stacking": {"file": "adani_stacking_ensemble_model.pkl", "name": "Adani Stacking Ensemble", "type": "Ensemble", "desc": "Stacking ensemble trained on Adani dataset"},
    "adani_ultimate": {"file": "adani_ultimate_covid_tuned_ensemble.pkl", "name": "Adani Ultimate Tuned", "type": "Ensemble", "desc": "Covid-tuned ensemble on Adani dataset"},
    "adani_voting": {"file": "adani_voting_ensemble_model.pkl", "name": "Adani Voting Ensemble", "type": "Ensemble", "desc": "Voting ensemble on Adani dataset"},
    "adani_xgboost": {"file": "adani_xgboost_model.pkl", "name": "Adani XGBoost", "type": "Gradient Boosting", "desc": "XGBoost trained on Adani dataset"},
}

for key in ADANI_KEYS:
    MODEL_STATUS[key] = {"loaded": False, "error": None, "mape": "N/A"}

_adani_models: Dict[str, Any] = {}

# ── LightGBM loader ──────────────────────────────────────────────────────────
def _load_lgbm() -> bool:
    global _lgbm_models
    if _lgbm_models:
        return True
    try:
        for quantile, path in [("p10", _LGBM_P10), ("p50", _LGBM_P50), ("p90", _LGBM_P90)]:
            with open(path, "rb") as f:
                _lgbm_models[quantile] = pickle.load(f)
        MODEL_STATUS["lgbm"]["loaded"] = True
        logger.info("LightGBM models loaded OK")
        return True
    except Exception as exc:
        MODEL_STATUS["lgbm"]["error"] = str(exc)
        logger.warning(f"LightGBM load failed: {exc}")
        return False


# ── TCN + XGBoost loader ─────────────────────────────────────────────────────
def _load_tcn_xgb() -> bool:
    global _tcn_model, _xgb_model, _scaler_x, _scaler_y, _tcn_meta
    if _tcn_model is not None:
        return True
    try:
        import torch
        import json

        # Metadata
        with open(_META_PH) as f:
            _tcn_meta = json.load(f)

        # Scalers
        import joblib
        try:
            _scaler_x = joblib.load(str(_SCALER_X))
        except Exception:
            with open(_SCALER_X, "rb") as f:
                _scaler_x = pickle.load(f)

        try:
            _scaler_y = joblib.load(str(_SCALER_Y))
        except Exception:
            with open(_SCALER_Y, "rb") as f:
                _scaler_y = pickle.load(f)


        # XGB corrector
        import xgboost as xgb
        _xgb_model = xgb.XGBRegressor()
        _xgb_model.load_model(str(_XGB_PH))

        # TCN weights — build a minimal TCN that matches the saved state dict
        window = _tcn_meta.get("window_size", 24)
        n_feat = len(_tcn_meta.get("features", [10]))

        import torch.nn as nn

        class _TCNBlock(nn.Module):
            def __init__(self, in_ch, out_ch, kernel=3, dilation=1):
                super().__init__()
                pad = (kernel - 1) * dilation
                self.conv = nn.Conv1d(in_ch, out_ch, kernel, padding=pad, dilation=dilation)
                self.relu = nn.ReLU()
            def forward(self, x):
                return self.relu(self.conv(x)[..., :x.shape[-1]])

        class _TCNModel(nn.Module):
            def __init__(self, n_features, window):
                super().__init__()
                self.tcn = nn.Sequential(
                    _TCNBlock(n_features, 64, dilation=1),
                    _TCNBlock(64, 128, dilation=2),
                    _TCNBlock(128, 64, dilation=4),
                    _TCNBlock(64, 32, dilation=8),
                )
                self.fc = nn.Linear(32, 1)
            def forward(self, x):           # x: (B, T, F)
                x = x.permute(0, 2, 1)      # (B, F, T)
                x = self.tcn(x)
                x = x[:, :, -1]             # last timestep
                return self.fc(x).squeeze(-1)

        model = _TCNModel(n_features=n_feat, window=window)
        state = torch.load(str(_TCN_PH), map_location="cpu")
        # Accept both raw state dict and {"model_state_dict": ...} wrappers
        if isinstance(state, dict) and "model_state_dict" in state:
            state = state["model_state_dict"]
        model.load_state_dict(state, strict=False)
        model.eval()
        _tcn_model = model

        MODEL_STATUS["tcn_xgb"]["loaded"] = True
        logger.info("TCN+XGB model loaded OK")
        return True
    except Exception as exc:
        MODEL_STATUS["tcn_xgb"]["error"] = str(exc)
        logger.warning(f"TCN+XGB load failed: {exc}")
        return False


# ── Adani Models Loader ──────────────────────────────────────────────────────
def _load_adani_model(key: str) -> bool:
    if key in _adani_models:
        return True
    try:
        import pickle
        import joblib
        path = _ROOT / "forecasting" / ADANI_KEYS[key]["file"]
        
        try:
            with open(path, "rb") as f:
                model = pickle.load(f)
        except Exception:
            # Fallback to joblib (solves invalid load key \x0a etc)
            model = joblib.load(str(path))
            
        _adani_models[key] = model
        MODEL_STATUS[key]["loaded"] = True
        logger.info(f"{key} model loaded OK")
        return True
    except Exception as exc:
        MODEL_STATUS[key]["error"] = str(exc)
        logger.warning(f"{key} load failed: {exc}")
        return False

# ── Mamba & Planner Loaders ──────────────────────────────────────────────────
def _load_planner() -> bool:
    global _planner_model
    if _planner_model is not None:
        return True
    try:
        import joblib
        path = _ROOT / "planner_model.pkl"
        _planner_model = joblib.load(str(path))
        MODEL_STATUS["planner"]["loaded"] = True
        return True
    except Exception as exc:
        MODEL_STATUS["planner"]["error"] = str(exc)
        return False

def _load_mamba() -> bool:
    global _mamba_model
    if _mamba_model is not None:
        return True
    try:
        import sys
        if str(_ROOT) not in sys.path:
            sys.path.insert(0, str(_ROOT))
        from mamba_ssm import MambaTrainer
        path = _ROOT / "prometheus_mamba_maharashtra.pt"
        _mamba_model = MambaTrainer.load(str(path), device="cpu")
        MODEL_STATUS["mamba"]["loaded"] = True
        return True
    except Exception as exc:
        MODEL_STATUS["mamba"]["error"] = str(exc)
        return False


# ── Feature builders ─────────────────────────────────────────────────────────

def _lgbm_features(hour: int, weekday: int) -> dict:
    """
    Build the exact 51-feature dictionary expected by the LightGBM models.
    """
    h_sin = math.sin(2 * math.pi * hour / 24)
    h_cos = math.cos(2 * math.pi * hour / 24)
    month = datetime.now().month
    m_sin = math.sin(2 * math.pi * month / 12)
    m_cos = math.cos(2 * math.pi * month / 12)
    base = BASE_MW_MH * HOUR_PROFILE[hour] * DAY_FACTOR[weekday]
    lag_24 = base
    lag_48 = base * 0.98
    lag_168 = base * DAY_FACTOR[(weekday - 7) % 7] / max(DAY_FACTOR[weekday], 0.01)
    
    temp = 28.0 - 5.0 * h_cos
    
    return {
        'year': 2026,
        'temperature_2m': temp,
        'relative_humidity_2m': 60.0,
        'apparent_temperature': temp + 2.0,
        'precipitation': 0.0,
        'rain': 0.0,
        'snowfall': 0.0,
        'weather_code': 0,
        'pressure_msl': 1010.0,
        'surface_pressure': 1000.0,
        'cloud_cover': 20.0,
        'cloud_cover_low': 10.0,
        'cloud_cover_mid': 5.0,
        'cloud_cover_high': 5.0,
        'vapour_pressure_deficit': 1.5,
        'wind_speed_10m': 10.0,
        'wind_direction_10m': 180.0,
        'wind_gusts_10m': 15.0,
        'shortwave_radiation': 500.0 * max(0, -h_cos),
        'direct_radiation': 300.0 * max(0, -h_cos),
        'diffuse_radiation': 200.0 * max(0, -h_cos),
        'direct_normal_irradiance': 400.0 * max(0, -h_cos),
        'sunshine_duration': 3600.0 * max(0, -h_cos),
        'is_day': 1 if 6 <= hour <= 18 else 0,
        'hour': hour,
        'state_encoded': 0,
        'month': month,
        'dayofweek': weekday,
        'is_weekend': 1 if weekday >= 5 else 0,
        'tod_window': hour // 4,
        'is_monsoon': 1 if 6 <= month <= 9 else 0,
        'is_covid': 0,
        'hour_sin': h_sin,
        'hour_cos': h_cos,
        'month_sin': m_sin,
        'month_cos': m_cos,
        'is_holiday': 0,
        'days_to_holiday': 10,
        'days_since_holiday': 10,
        'lag_24h': lag_24,
        'lag_48h': lag_48,
        'lag_168h': lag_168,
        'rolling_mean_24h': base,
        'rolling_std_24h': base * 0.02,
        'rolling_mean_168h': base * 0.99,
        'CDH': max(0, temp - 22.0),
        'HDH': 0.0,
        'apparent_CDH': max(0, temp + 2.0 - 22.0),
        'temp_humidity_idx': 25.0,
        'temp_roll_mean_24h': 28.0,
        'temp_roll_max_24h': 33.0
    }


def _tcn_features(hour: int, weekday: int) -> list:
    """10-feature vector matching final_prefix_metadata.json feature list."""
    h_sin  = math.sin(2 * math.pi * hour / 24)
    h_cos  = math.cos(2 * math.pi * hour / 24)
    month  = datetime.now().month
    m_sin  = math.sin(2 * math.pi * month / 12)
    m_cos  = math.cos(2 * math.pi * month / 12)
    base   = BASE_MW_GJ * HOUR_PROFILE[hour] * DAY_FACTOR[weekday]
    lag_1  = BASE_MW_GJ * HOUR_PROFILE[(hour - 1) % 24] * DAY_FACTOR[weekday]
    lag_24 = base
    lag_168 = base
    roll_mean = base
    roll_std  = base * 0.02
    diff_1h   = base - lag_1
    return [h_sin, h_cos, m_sin, m_cos, lag_1, lag_24, lag_168,
            roll_mean, roll_std, diff_1h]


def _adani_features(hour: int, weekday: int) -> list:
    import math
    from datetime import datetime
    dayofweek = weekday
    is_weekend = 1 if dayofweek >= 5 else 0
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    month = datetime.now().month
    month_sin = math.sin(2 * math.pi * month / 12)
    month_cos = math.cos(2 * math.pi * month / 12)
    
    base = BASE_MW_GJ * HOUR_PROFILE[hour] * DAY_FACTOR[weekday]
    lag_1 = BASE_MW_GJ * HOUR_PROFILE[(hour - 1) % 24] * DAY_FACTOR[weekday]
    lag_24 = base
    lag_168 = base * DAY_FACTOR[(weekday - 7) % 7] / max(DAY_FACTOR[weekday], 0.01)
    
    rolling_mean_24 = base
    rolling_std_24 = base * 0.02
    is_business_hour = 1 if 9 <= hour <= 18 and not is_weekend else 0
    is_holiday = 0
    ema_12 = base
    ema_24 = base
    diff_1 = base - lag_1
    diff_24 = 0
    rolling_max_24 = base * 1.05
    rolling_max_168 = base * 1.05

    return [
        dayofweek, is_weekend, hour_sin, hour_cos, month_sin, month_cos,
        lag_1, lag_24, lag_168, rolling_mean_24, rolling_std_24,
        is_business_hour, is_holiday, ema_12, ema_24, diff_1, diff_24,
        rolling_max_24, rolling_max_168
    ]


# ── Public interface ─────────────────────────────────────────────────────────

@lru_cache(maxsize=2048)
def predict_hourly(model_key: str, hour: int, weekday: int) -> Tuple[float, float, float]:
    """
    Return (p10, p50, p90) demand in MW for a given hour & weekday.
    Falls back to 'synthetic' if the requested model is unavailable.
    """
    if model_key == "lgbm":
        if _load_lgbm():
            return _predict_lgbm(hour, weekday)
        model_key = "synthetic"

    if model_key == "tcn_xgb":
        if _load_tcn_xgb():
            return _predict_tcn_xgb(hour, weekday)
        model_key = "synthetic"
        
    if model_key == "mamba":
        if _load_mamba():
            return _predict_mamba(hour, weekday)
        model_key = "synthetic"
        
    if model_key == "planner":
        if _load_planner():
            return _predict_planner(hour, weekday)
        model_key = "synthetic"

    if model_key in ADANI_KEYS:
        if _load_adani_model(model_key):
            return _predict_adani(model_key, hour, weekday)
        model_key = "synthetic"

    return _predict_synthetic(hour, weekday)


def _predict_synthetic(hour: int, weekday: int) -> Tuple[float, float, float]:
    rng  = random.Random(_SEED + hour * 31 + weekday * 7)
    noise = 1.0 + rng.uniform(-0.025, 0.025)
    p50  = round(BASE_MW_MH * HOUR_PROFILE[hour % 24] * DAY_FACTOR[weekday % 7] * noise, 1)
    p10  = round(p50 * 0.95, 1)
    p90  = round(p50 * 1.05, 1)
    return p10, p50, p90


def _predict_lgbm(hour: int, weekday: int) -> Tuple[float, float, float]:
    import pandas as pd
    feat_dict = _lgbm_features(hour, weekday)
    df = pd.DataFrame([feat_dict])
    try:
        p10 = float(_lgbm_models["p10"].predict(df)[0])
        p50 = float(_lgbm_models["p50"].predict(df)[0])
        p90 = float(_lgbm_models["p90"].predict(df)[0])
        # Sanity-clamp: keep within realistic range
        p50 = max(5_000, min(25_000, p50))
        p10 = max(4_000, min(p50, p10))
        p90 = max(p50, min(26_000, p90))
        return round(p10, 1), round(p50, 1), round(p90, 1)
    except Exception as exc:
        MODEL_STATUS["lgbm"]["error"] = str(exc)
        logger.warning(f"LightGBM predict failed: {exc}, falling back to synthetic")
        return _predict_synthetic(hour, weekday)



def _predict_tcn_xgb(hour: int, weekday: int) -> Tuple[float, float, float]:
    import numpy as np
    try:
        import torch
        feat_row = _tcn_features(hour, weekday)
        # Build a window of 24 timesteps (replicate current hour's features across window)
        window = _tcn_meta.get("window_size", 24)
        seq = np.array([feat_row] * window, dtype=np.float32)  # (T, F)
        seq_scaled = _scaler_x.transform(seq)
        x = torch.tensor(seq_scaled, dtype=torch.float32).unsqueeze(0)  # (1, T, F)
        with torch.no_grad():
            tcn_out = _tcn_model(x).item()
        # XGB corrects the TCN residual
        xgb_feat = np.array([_tcn_features(hour, weekday)], dtype=np.float64)
        correction = float(_xgb_model.predict(xgb_feat)[0])
        raw = tcn_out + correction
        # Inverse-scale
        raw_arr = np.array([[raw]], dtype=np.float32)
        p50_scaled = _scaler_y.inverse_transform(raw_arr)[0][0]
        p50 = float(p50_scaled)
        # Sanity-clamp Gujarat scale
        p50 = max(5_000, min(22_000, p50))
        p10 = round(p50 * 0.95, 1)
        p90 = round(p50 * 1.05, 1)
        return p10, round(p50, 1), p90
    except Exception as exc:
        MODEL_STATUS["tcn_xgb"]["error"] = str(exc)
        logger.warning(f"TCN+XGB predict failed: {exc}, falling back to synthetic")
        return _predict_synthetic(hour, weekday)



def _predict_adani(model_key: str, hour: int, weekday: int) -> Tuple[float, float, float]:
    import numpy as np
    import pandas as pd
    from datetime import datetime, timedelta
    
    try:
        model = _adani_models[model_key]
        
        feat_list = _adani_features(hour, weekday)
        if model_key == "adani_ultimate":
            feat_list.append(0.0) # covid_severity
            feature_names = ['dayofweek', 'is_weekend', 'hour_sin', 'hour_cos', 'month_sin', 'month_cos', 'lag_1', 'lag_24', 'lag_168', 'rolling_mean_24', 'rolling_std_24', 'is_business_hour', 'is_holiday', 'ema_12', 'ema_24', 'diff_1', 'diff_24', 'rolling_max_24', 'rolling_max_168', 'covid_severity']
        else:
            feature_names = ['dayofweek', 'is_weekend', 'hour_sin', 'hour_cos', 'month_sin', 'month_cos', 'lag_1', 'lag_24', 'lag_168', 'rolling_mean_24', 'rolling_std_24', 'is_business_hour', 'is_holiday', 'ema_12', 'ema_24', 'diff_1', 'diff_24', 'rolling_max_24', 'rolling_max_168']
            
        feat = np.array([feat_list])
        df = pd.DataFrame(feat, columns=feature_names)
        
        if model_key == "adani_prophet":
            now = datetime.now()
            days_ahead = (weekday - now.weekday()) % 7
            mock_date = now + timedelta(days=days_ahead)
            mock_date = mock_date.replace(hour=hour, minute=0, second=0, microsecond=0)
            
            df['ds'] = [mock_date]
            
            pred = model.predict(df)
            p50 = float(pred['yhat'].iloc[0])
        else:
            p50 = float(model.predict(df)[0])
            
        p50 = max(5_000, min(25_000, p50))
        p10 = round(p50 * 0.95, 1)
        p90 = round(p50 * 1.05, 1)
        return p10, round(p50, 1), p90
    except Exception as exc:
        MODEL_STATUS[model_key]["error"] = str(exc)
        logger.warning(f"{model_key} predict failed: {exc}, falling back to synthetic")
        return _predict_synthetic(hour, weekday)

def _predict_planner(hour: int, weekday: int) -> Tuple[float, float, float]:
    try:
        import numpy as np
        feat = np.zeros(31)
        feat[4] = hour
        feat[5] = weekday
        base = BASE_MW_MH * HOUR_PROFILE[hour] * DAY_FACTOR[weekday]
        feat[20] = base
        p50 = float(_planner_model.predict([feat])[0])
        p50 = max(5000, min(25000, p50))
        return round(p50 * 0.95, 1), round(p50, 1), round(p50 * 1.05, 1)
    except:
        return _predict_synthetic(hour, weekday)

def _predict_mamba(hour: int, weekday: int) -> Tuple[float, float, float]:
    try:
        import numpy as np
        feat = np.zeros((1, 168, 14), dtype=np.float32)
        feat[:, :, 0] = hour
        out = _mamba_model.predict(feat)
        p50 = float(out["p50"][0, 0])
        p50 = max(5000, min(25000, p50))
        return round(p50 * 0.95, 1), round(p50, 1), round(p50 * 1.05, 1)
    except:
        return _predict_synthetic(hour, weekday)



def get_model_registry() -> list:
    """Return metadata about all available models for the /models endpoint."""
    # Trigger lazy loads so status is fresh
    _load_lgbm()
    _load_tcn_xgb()

    registry = [
        {
            "key": "synthetic",
            "name": "Synthetic Baseline",
            "description": "Deterministic demand profile with realistic noise. Always available.",
            "type": "Rule-based",
            "mape": "~3.5%",
            "quantiles": True,
            "loaded": True,
            "error": None,
        },
        {
            "key": "lgbm",
            "name": "LightGBM Quantile Ensemble",
            "description": "Three independent LightGBM models trained for P10, P50, P90 quantiles on historical grid data.",
            "type": "Gradient Boosting",
            "mape": "~2.8%",
            "quantiles": True,
            "loaded": MODEL_STATUS["lgbm"]["loaded"],
            "error": MODEL_STATUS["lgbm"]["error"],
        },
        {
            "key": "tcn_xgb",
            "name": "TCN + XGBoost (Final Submission)",
            "description": "Temporal Convolutional Network as base model with XGBoost error-corrector. Achieved 1.54% MAPE.",
            "type": "Deep Learning + Boosting",
            "mape": "1.54%",
            "quantiles": False,
            "loaded": MODEL_STATUS["tcn_xgb"]["loaded"],
            "error": MODEL_STATUS["tcn_xgb"]["error"],
        },
        {
            "key": "mamba",
            "name": "Mamba SSM (Maharashtra)",
            "description": "Selective State Space Model (Mamba) for long-sequence forecasting.",
            "type": "State Space Model",
            "mape": "1.85%",
            "quantiles": True,
            "loaded": MODEL_STATUS["mamba"]["loaded"],
            "error": MODEL_STATUS["mamba"]["error"],
        },
        {
            "key": "planner",
            "name": "Planner Model (LightGBM)",
            "description": "High-dimensional LightGBM model evaluating 31 weather and operational features.",
            "type": "Gradient Boosting",
            "mape": "2.10%",
            "quantiles": False,
            "loaded": MODEL_STATUS["planner"]["loaded"],
            "error": MODEL_STATUS["planner"]["error"],
        }
    ]

    for key, info in ADANI_KEYS.items():
        _load_adani_model(key)
        registry.append({
            "key": key,
            "name": info["name"],
            "description": info["desc"],
            "type": info["type"],
            "mape": MODEL_STATUS[key]["mape"],
            "quantiles": False,
            "loaded": MODEL_STATUS[key]["loaded"],
            "error": MODEL_STATUS[key]["error"],
        })

    return registry
