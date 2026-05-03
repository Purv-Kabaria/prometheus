from fastapi import APIRouter, Query
import pandas as pd
import numpy as np
from pathlib import Path
from services.features import load_and_preprocess_data, engineer_features
from services.inference import predict_quantiles

router = APIRouter(prefix="/api/grid-history", tags=["Historical Intelligence"])

@router.get("")
def get_grid_history(
    freq: str = Query("H", pattern="^(H|D|W|M)$"),
    limit: int = Query(100, ge=1, le=5000)
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
        # Mapping for pandas resample
        resample_map = {"H": "H", "D": "D", "W": "W", "M": "ME"}
        target_freq = resample_map.get(freq, "H")
        
        # We aggregate actuals first
        df_agg = df.resample(target_freq).mean().dropna()
        
        # 3. Subsample to requested limit
        df_subset = df_agg.tail(limit)
        
        # 4. Feature Engineer (on aggregated data)
        # Note: lag features on daily/weekly data will look back days/weeks
        df_feat = engineer_features(df_subset)
        
        results = []
        for ts, row in df_feat.iterrows():
            # If freq is not hourly, model features (like hour_sin) are less precise
            # but still provide a "representative" baseline prediction.
            p10, p50, p90 = predict_quantiles(pd.DataFrame([row]))
            
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
            "frequency": freq
        }
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return {"data": [], "error": str(e)}
