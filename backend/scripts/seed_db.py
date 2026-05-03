import os
import sys
from datetime import datetime, timedelta

# Add backend to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.storage import init_db, log_prediction
from services.features import load_and_preprocess_data, engineer_features
from services.inference import predict_quantiles
import pandas as pd
from tqdm import tqdm

def seed():
    print("Initializing Database...")
    init_db()
    
    print("Loading Dataset...")
    try:
        df = load_and_preprocess_data()
        df = engineer_features(df)
        
        # We'll seed the last 30 days of data for the demo
        # To avoid being too slow, we'll use a subset
        recent = df.tail(24 * 30) 
        
        print(f"Seeding {len(recent)} records (inference + log)...")
        for ts, row in tqdm(recent.iterrows(), total=len(recent)):
            # In a real seed, we might skip inference if we have historical predictions,
            # but here we generate them to show the model's performance.
            p10, p50, p90 = predict_quantiles(pd.DataFrame([row]))
            log_prediction(ts.isoformat(), row['consumption_mwh'], p10, p50, p90)
            
        print("Seeding completed successfully.")
    except Exception as e:
        print(f"Error during seeding: {e}")

if __name__ == "__main__":
    seed()
