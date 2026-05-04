from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any
from datetime import datetime, timedelta
from services.ember_client import ember_client

router = APIRouter(prefix="/api/ember", tags=["Ember Energy Market"])

@router.get("/live")
async def get_live_market_data(entity: str = Query(default="IND")):
    """
    Returns current and tomorrow's live pricing data from the Ember API.
    """
    try:
        data = await ember_client.fetch_live_prices(entity_code=entity)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/hourly")
async def get_hourly_prices(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    entity: str = Query(default="IND")
):
    """
    Fetch hourly prices over a given range using the Ember API client.
    """
    try:
        df = await ember_client.fetch_hourly_prices(start_date, end_date, entity)
        if df.empty:
            return {"data": []}
        
        # Convert timestamp to ISO format string
        df["timestamp"] = df["timestamp"].dt.strftime('%Y-%m-%dT%H:%M:%S')
        return {"data": df.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/bulk-historical")
async def get_bulk_historical(
    start_year: int = Query(...),
    end_year: int = Query(...),
    entity: str = Query(default="IND")
):
    """
    Bulk historical fetcher chunked by year.
    """
    try:
        df = await ember_client.fetch_historical_bulk(start_year, end_year, entity)
        if df.empty:
            return {"data": []}
        
        df["timestamp"] = df["timestamp"].dt.strftime('%Y-%m-%dT%H:%M:%S')
        return {"data": df.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
