from backend.routers.model_inference import predict_hourly

models = [
    'adani_catboost',
    'adani_lightgbm',
    'adani_prophet',
    'adani_stacking',
    'adani_ultimate',
    'adani_voting',
    'adani_xgboost'
]

for m in models:
    print(m, predict_hourly(m, 12, 1))
