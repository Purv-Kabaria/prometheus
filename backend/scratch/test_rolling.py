import math
import joblib
import pandas as pd

ADANI_BASE_MW = 13200
ADANI_HOUR_PROFILE = [
    0.98, 0.97, 0.96, 0.95, 0.96, 0.97,
    0.98, 0.99, 1.01, 1.02, 1.03, 1.04,
    1.05, 1.04, 1.03, 1.02, 1.01, 1.02,
    1.03, 1.04, 1.03, 1.01, 0.99, 0.98
]
ADANI_DAY_FACTOR = {0: 1.0, 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 0.99, 6: 0.98}

def get_feat(hour, weekday):
    base = ADANI_BASE_MW * ADANI_HOUR_PROFILE[hour] * ADANI_DAY_FACTOR[weekday]
    lag_1 = ADANI_BASE_MW * ADANI_HOUR_PROFILE[(hour - 1) % 24] * ADANI_DAY_FACTOR[weekday]
    lag_24 = ADANI_BASE_MW * ADANI_HOUR_PROFILE[hour] * ADANI_DAY_FACTOR[(weekday - 1) % 7]
    lag_168 = base
    
    sum_24 = 0
    for i in range(1, 25):
        h_i = (hour - i) % 24
        days_back = math.ceil((i - hour) / 24) if i > hour else 0
        wd_i = (weekday - days_back) % 7
        sum_24 += ADANI_BASE_MW * ADANI_HOUR_PROFILE[h_i] * ADANI_DAY_FACTOR[wd_i]
    rolling_mean_24 = sum_24 / 24
    
    sum_sq = 0
    for i in range(1, 25):
        h_i = (hour - i) % 24
        days_back = math.ceil((i - hour) / 24) if i > hour else 0
        wd_i = (weekday - days_back) % 7
        sum_sq += (ADANI_BASE_MW * ADANI_HOUR_PROFILE[h_i] * ADANI_DAY_FACTOR[wd_i] - rolling_mean_24) ** 2
    rolling_std_24 = math.sqrt(sum_sq / 24)
    
    sum_12 = 0
    for i in range(1, 13):
        h_i = (hour - i) % 24
        days_back = math.ceil((i - hour) / 24) if i > hour else 0
        wd_i = (weekday - days_back) % 7
        sum_12 += ADANI_BASE_MW * ADANI_HOUR_PROFILE[h_i] * ADANI_DAY_FACTOR[wd_i]
    ema_12 = sum_12 / 12
    
    ema_24 = rolling_mean_24
    diff_1 = base - lag_1
    diff_24 = base - lag_24
    
    max_24 = 0
    for i in range(1, 25):
        h_i = (hour - i) % 24
        days_back = math.ceil((i - hour) / 24) if i > hour else 0
        wd_i = (weekday - days_back) % 7
        val = ADANI_BASE_MW * ADANI_HOUR_PROFILE[h_i] * ADANI_DAY_FACTOR[wd_i]
        if val > max_24:
            max_24 = val
    rolling_max_24 = max_24
    
    rolling_max_168 = max(ADANI_BASE_MW * hp * df for hp in ADANI_HOUR_PROFILE for df in ADANI_DAY_FACTOR.values())
    
    return {
        'dayofweek': weekday,
        'is_weekend': 1 if weekday >= 5 else 0,
        'hour_sin': math.sin(2 * math.pi * hour / 24),
        'hour_cos': math.cos(2 * math.pi * hour / 24),
        'month_sin': math.sin(2 * math.pi * 5 / 12),
        'month_cos': math.cos(2 * math.pi * 5 / 12),
        'lag_1': lag_1,
        'lag_24': lag_24,
        'lag_168': lag_168,
        'rolling_mean_24': rolling_mean_24,
        'rolling_std_24': rolling_std_24,
        'is_business_hour': 1 if 9 <= hour <= 18 and weekday < 5 else 0,
        'is_holiday': 0,
        'ema_12': ema_12,
        'ema_24': ema_24,
        'diff_1': diff_1,
        'diff_24': diff_24,
        'rolling_max_24': rolling_max_24,
        'rolling_max_168': rolling_max_168,
        'covid_severity': 0.0
    }

d = get_feat(12, 1)
for key in ['adani_catboost_model.pkl', 'adani_lightgbm_model.pkl', 'adani_stacking_ensemble_model.pkl', 'adani_ultimate_covid_tuned_ensemble.pkl', 'adani_voting_ensemble_model.pkl', 'adani_xgboost_model.pkl']:
    m = joblib.load(f'models/forecasting/{key}')
    feature_names = getattr(m, 'feature_names_in_', getattr(m, 'feature_name_', getattr(m, 'feature_names_', None)))
    if feature_names is None:
        feature_names = ['dayofweek', 'is_weekend', 'hour_sin', 'hour_cos', 'month_sin', 'month_cos',
                         'lag_1', 'lag_24', 'lag_168', 'rolling_mean_24', 'rolling_std_24',
                         'is_business_hour', 'is_holiday', 'ema_12', 'ema_24', 'diff_1', 'diff_24',
                         'rolling_max_24', 'rolling_max_168']
    if hasattr(feature_names, "tolist"):
        feature_names = feature_names.tolist()
    
    feat = [d[c] for c in feature_names]
    print(key, m.predict(pd.DataFrame([feat], columns=feature_names)))
