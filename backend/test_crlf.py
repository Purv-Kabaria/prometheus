import pickle
path = 'models/forecasting/adani_stacking_ensemble_model.pkl'
with open(path, 'rb') as f:
    data = f.read()
print('Original len:', len(data))
try:
    pickle.loads(data)
    print('Loaded original!')
except Exception as e:
    print('Original error:', e)
data_fixed = data.replace(b'\r\n', b'\n')
print('Fixed len:', len(data_fixed))
try:
    pickle.loads(data_fixed)
    print('Loaded fixed!')
except Exception as e:
    print('Fixed error:', e)
