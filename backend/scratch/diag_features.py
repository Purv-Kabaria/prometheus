import sys
sys.path.insert(0, ".")
from routers.model_inference import _adani_features_dict, predict_hourly

print("--- Feature Values ---")
for h in [0, 6, 12, 18, 22]:
    d = _adani_features_dict(h, 1)
    print(f"h={h}: lag_1={d['lag_1']:.0f}, lag_24={d['lag_24']:.0f}, ema_12={d.get('ema_12',0):.0f}, ema_24={d.get('ema_24',0):.0f}, diff_1={d.get('diff_1',0):.1f}")

print("\n--- Model Predictions ---")
for key in ["adani_catboost", "adani_lightgbm", "adani_xgboost"]:
    print(f"\n{key}:")
    for h in [0, 6, 12, 18, 22]:
        p10, p50, p90 = predict_hourly(key, h, 1)
        print(f"  h={h}: p10={p10:.0f} p50={p50:.0f} p90={p90:.0f}")
