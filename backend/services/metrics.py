import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

def calculate_metrics(actual, predicted):
    """Calculate MAE, RMSE, and MAPE."""
    actual = np.array(actual)
    predicted = np.array(predicted)
    
    mask = (actual != 0) & (~np.isnan(actual)) & (~np.isnan(predicted))
    actual = actual[mask]
    predicted = predicted[mask]
    
    if len(actual) == 0:
        return {"mae": 0, "rmse": 0, "mape": 0}
    
    mae = mean_absolute_error(actual, predicted)
    rmse = np.sqrt(mean_squared_error(actual, predicted))
    mape = np.mean(np.abs((actual - predicted) / actual)) * 100
    
    return {
        "mae": round(float(mae), 2),
        "rmse": round(float(rmse), 2),
        "mape": round(float(mape), 2)
    }

def detect_drift(current_mae, historical_mae, threshold=1.5):
    """
    Simple drift detection.
    If current MAE is significantly higher than historical, flag as drifting.
    """
    if historical_mae == 0:
        return "stable", "Insufficient historical data."
    
    ratio = current_mae / historical_mae
    if ratio > threshold:
        return "drifting", f"MAE has increased by {round((ratio-1)*100, 1)}%. Model retraining recommended."
    elif ratio > 1.2:
        return "warning", "Slight increase in error detected. Monitor closely."
    else:
        return "stable", "No drift detected. Model retraining not needed."
