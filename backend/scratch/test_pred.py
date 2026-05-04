import joblib
import pandas as pd
import math
from datetime import datetime

# Exactly match _adani_features_dict from model_inference.py
ADANI_BASE_MW = 13200
ADANI_HOUR_PROFILE = [
    0.88, 0.85, 0.83, 0.81, 0.82, 0.86,
    0.92, 0.99, 1.06, 1.10, 1.12, 1.13,
    1.14, 1.13, 1.11, 1.09, 1.10, 1.12,
    1.13, 1.11, 1.07, 1.01, 0.95, 0.91
]
ADANI_DAY_FACTOR = {0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0, 4: 0.98, 5: 0.91, 6: 0.86}

def get_feat(hour: int, weekday: int) -> dict:
    dayofweek = weekday % 7
    is_weekend = 1 if dayofweek >= 5 else 0
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    month = datetime.now().month
    month_sin = math.sin(2 * math.pi * month / 12)
    month_cos = math.cos(2 * math.pi * month / 12)

    def _demand(h, wd):
        return ADANI_BASE_MW * ADANI_HOUR_PROFILE[h % 24] * ADANI_DAY_FACTOR[wd % 7]

    base   = _demand(hour, dayofweek)
    lag_1  = _demand(hour - 1, dayofweek)
    lag_24 = _demand(hour, (dayofweek - 1) % 7)
    lag_168 = _demand(hour, (dayofweek - 1) % 7)

    rolling_vals_24 = [_demand(hour - i, (dayofweek - (1 if i > hour else 0)) % 7) for i in range(1, 25)]
    rolling_mean_24 = sum(rolling_vals_24) / 24.0
    rolling_std_24  = math.sqrt(sum((v - rolling_mean_24) ** 2 for v in rolling_vals_24) / 24.0)
    rolling_max_24  = max(rolling_vals_24)
    rolling_max_168 = max(_demand(h, wd) for h in range(24) for wd in range(7))

    ema_12 = sum(_demand(hour - i, (dayofweek - (1 if i > hour else 0)) % 7) for i in range(1, 13)) / 12.0
    ema_24 = rolling_mean_24
    diff_1  = base - lag_1
    diff_24 = base - lag_24

    return {
        "dayofweek":       dayofweek,
        "is_weekend":      is_weekend,
        "hour_sin":        hour_sin,
        "hour_cos":        hour_cos,
        "month_sin":       month_sin,
        "month_cos":       month_cos,
        "lag_1":           lag_1,
        "lag_24":          lag_24,
        "lag_168":         lag_168,
        "rolling_mean_24": rolling_mean_24,
        "rolling_std_24":  rolling_std_24,
        "is_business_hour": 1 if 9 <= hour <= 18 and not is_weekend else 0,
        "is_holiday":      0,
        "ema_12":          ema_12,
        "ema_24":          ema_24,
        "diff_1":          diff_1,
        "diff_24":         diff_24,
        "rolling_max_24":  rolling_max_24,
        "rolling_max_168": rolling_max_168,
    }

cols = ['dayofweek', 'is_weekend', 'hour_sin', 'hour_cos', 'month_sin', 'month_cos', 'lag_1', 'lag_24', 'lag_168', 'rolling_mean_24', 'rolling_std_24', 'is_business_hour', 'is_holiday', 'ema_12', 'ema_24', 'diff_1', 'diff_24', 'rolling_max_24', 'rolling_max_168']

for key in ['adani_catboost_model.pkl', 'adani_lightgbm_model.pkl', 'adani_xgboost_model.pkl']:
    m = joblib.load(f'backend/models/forecasting/{key}')
    df = pd.DataFrame([get_feat(12, 1)[c] for c in cols]).T
    df.columns = cols
    print(key, m.predict(df))
