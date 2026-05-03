from fastapi import APIRouter, Query
from services.features import get_latest_features, load_and_preprocess_data, engineer_features
from services.inference import predict_quantiles
from services.storage import get_recent_history, log_prediction
from datetime import datetime, timedelta
import pandas as pd

router = APIRouter(prefix="/api/live-comparison", tags=["Operational Intelligence"])

@router.get("")
def get_live_comparison(hours: int = Query(default=24, ge=1, le=168)):
    """
    Returns actual vs predicted data for the last N hours.
    """
    # In a real system, this would just query the storage.
    # For the MVP, we'll ensure the storage has some data by running inference on the last N hours of the dataset.
    
    history = get_recent_history(hours)
    
    if len(history) < hours:
        # Seed or backfill data if empty (simplified for demo)
        backfill_data(hours)
        history = get_recent_history(hours)
        
    data_list = history.to_dict(orient="records")
    
    # Calculate summary
    if not history.empty and 'deviation_pct' in history.columns:
        avg_dev = history['deviation_pct'].mean()
        max_dev = history['deviation_pct'].max()
        status = "normal" if avg_dev < 5 else "warning" if avg_dev < 10 else "critical"
    else:
        avg_dev = 0
        max_dev = 0
        status = "unknown"
        
    return {
        "data": data_list,
        "summary": {
            "avg_deviation_pct": round(avg_dev, 2) if avg_dev is not None else 0,
            "max_deviation": round(max_dev, 2) if max_dev is not None else 0,
            "status": status
        }
    }

def backfill_data(hours):
    """Simple backfill logic to populate DB from Excel for demo purposes."""
    df = load_and_preprocess_data()
    df = engineer_features(df)
    
    # Take the last N hours
    recent = df.tail(hours)
    
    for ts, row in recent.iterrows():
        # Run inference for each row (this is slow but fine for one-time backfill)
        # In production, this would happen in real-time or via a batch job.
        p10, p50, p90 = predict_quantiles(pd.DataFrame([row]))
        log_prediction(ts.isoformat(), row['consumption_mwh'], p10, p50, p90)
