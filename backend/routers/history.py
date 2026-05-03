from fastapi import APIRouter, Query
import pandas as pd
import numpy as np
from pathlib import Path
from services.features import load_and_preprocess_data, engineer_features
from services.inference import predict_quantiles

router = APIRouter(prefix="/api/grid-history", tags=["Historical Intelligence"])

from .model_inference import predict_hourly, get_model_registry

@router.get("")
def get_grid_history(
    freq: str = Query("H", pattern="^(H|D|W|M)$"),
    limit: int = Query(100, ge=1, le=5000),
    model: str = Query("default")
):
    """
    Returns historical actuals vs predicted for 2016-2021.
    """
    try:
        # 1. Load full hourly dataset
        df = load_and_preprocess_data()
        if df.empty:
            return {"data": [], "error": "Dataset is empty"}

        # 2. Resample based on frequency BEFORE predicting (for performance)
        resample_map = {"H": "H", "D": "D", "W": "W", "M": "ME"}
        target_freq = resample_map.get(freq, "H")
        
        # We aggregate actuals first
        df_agg = df.resample(target_freq).mean().dropna()
        
        # 3. Subsample to requested limit
        df_subset = df_agg.tail(limit)
        
        results = []
        model_key = "lgbm" if model == "default" else model
        
        # Mapping for offset calculation
        freq_to_hours = {"H": 1, "D": 24, "W": 168, "M": 720}
        n_hours = freq_to_hours.get(freq, 1)

        for ts, row in df_subset.iterrows():
            # If frequency is not hourly, we calculate the average prediction for the period
            if freq == "H":
                p10, p50, p90 = predict_hourly(model_key, ts.hour, ts.weekday())
            else:
                # Approximate the mean prediction over the period (e.g. 24h for a day)
                # to make the trend line meaningful
                p10s, p50s, p90s = [], [], []
                # Sample a few hours to represent the period if it's large, 
                # or just iterate if it's manageable (e.g. 24h for Day)
                step = 1 if freq == "D" else (6 if freq == "W" else 24)
                for h_offset in range(0, n_hours, step):
                    curr_ts = ts + pd.Timedelta(hours=h_offset)
                    # Note: ts is the START of the period for Daily/Weekly in pandas resample usually
                    # but we just need a representative average profile
                    q10, q50, q90 = predict_hourly(model_key, curr_ts.hour, curr_ts.weekday())
                    p10s.append(q10)
                    p50s.append(q50)
                    p90s.append(q90)
                
                p10 = round(sum(p10s) / len(p10s), 1)
                p50 = round(sum(p50s) / len(p50s), 1)
                p90 = round(sum(p90s) / len(p90s), 1)
            
            results.append({
                "timestamp": ts.isoformat(),
                "actual": round(float(row["consumption_mwh"]), 1),
                "predicted_p10": p10,
                "predicted_p50": p50,
                "predicted_p90": p90
            })
            
        return {
            "data": results,
            "range": {
                "start": df_subset.index.min().isoformat() if not df_subset.empty else None,
                "end": df_subset.index.max().isoformat() if not df_subset.empty else None
            },
            "frequency": freq,
            "model_evaluated": model_key
        }

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return {"data": [], "error": str(e)}

