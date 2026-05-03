from fastapi import APIRouter
from services.storage import get_metrics_for_window
from services.metrics import calculate_metrics, detect_drift
import pandas as pd
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/model/performance", tags=["Operational Intelligence"])

@router.get("")
def get_performance_summary():
    """Returns current MAE/RMSE/MAPE for 7/30/90 day windows."""
    df_7d = get_metrics_for_window(7)
    df_30d = get_metrics_for_window(30)
    df_90d = get_metrics_for_window(90)
    
    m_7d = calculate_metrics(df_7d['actual'], df_7d['predicted_p50'])
    m_30d = calculate_metrics(df_30d['actual'], df_30d['predicted_p50'])
    m_90d = calculate_metrics(df_90d['actual'], df_90d['predicted_p50'])
    
    drift_status, drift_msg = detect_drift(m_7d['mae'], m_90d['mae'])
    
    return {
        "current": {
            "7d": m_7d,
            "30d": m_30d,
            "90d": m_90d
        },
        "drift_status": drift_status,
        "drift_message": drift_msg,
        "trend": calculate_trend(df_90d)
    }

def calculate_trend(df):
    """Group metrics by week for the trend chart."""
    if df.empty:
        return []
    
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df['week'] = df['timestamp'].dt.strftime('W%V') # Week number
    
    trend = []
    for week, group in df.groupby('week'):
        metrics = calculate_metrics(group['actual'], group['predicted_p50'])
        trend.append({
            "week": week,
            "mae": metrics['mae'],
            "rmse": metrics['rmse'],
            "mape": metrics['mape']
        })
    
    return trend
