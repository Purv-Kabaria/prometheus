import pickle
import joblib

models = [
    'adani_catboost_model.pkl',
    'adani_lightgbm_model.pkl',
    'adani_prophet_model.pkl',
    'adani_stacking_ensemble_model.pkl',
    'adani_ultimate_covid_tuned_ensemble.pkl',
    'adani_voting_ensemble_model.pkl',
    'adani_xgboost_model.pkl'
]

for m in models:
    try:
        path = f'D:/CODING/ps1_promtheus/backend/models/forecasting/{m}'
        with open(path, 'rb') as f:
            obj = pickle.load(f)
        feat = getattr(obj, 'feature_names_in_', 'No feature names')
        print(f'{m}: {type(obj)} - Features: {len(feat) if hasattr(feat, "__len__") else feat}')
    except Exception as e:
        print(f'{m}: Error {e}')
