import pickle

models = [
    'adani_catboost_model.pkl',
    'adani_lightgbm_model.pkl',
    'adani_stacking_ensemble_model.pkl',
    'adani_ultimate_covid_tuned_ensemble.pkl',
    'adani_voting_ensemble_model.pkl'
]

for m in models:
    try:
        with open(f'D:/CODING/ps1_promtheus/backend/models/forecasting/{m}', 'rb') as f:
            obj = pickle.load(f)
        feat = getattr(obj, 'feature_names_in_', getattr(obj, 'feature_name_', 'No feat'))
        if hasattr(feat, '__len__') and not isinstance(feat, str):
            print(f'{m}: {len(feat)} features')
        else:
            print(f'{m}: {feat}')
    except Exception as e:
        print(f'{m} error: {e}')
