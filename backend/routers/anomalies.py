from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from anomaly_pipeline import (
    MIN_PRIOR,
    ROLLBACK,
    explain_anomaly_with_llm,
    get_record,
    load_anomaly_log,
    load_gold_tail,
    run_post_ingest_anomaly_scan,
    update_record,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/anomalies", tags=["Anomalies"])


@router.get("/list")
def list_anomalies(limit: int = Query(default=200, ge=1, le=2000)):
    items = load_anomaly_log()
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"anomalies": items[:limit], "total": len(items)}


@router.get("/alerts/active")
def active_alerts():
    items = [
        a
        for a in load_anomaly_log()
        if not a.get("acknowledged") and a.get("severity") in ("high", "medium")
    ]
    items.sort(key=lambda x: abs(float(x.get("z_score", 0))), reverse=True)
    return {"alerts": items[:30], "count": len(items)}


@router.post("/{anomaly_id}/ack")
def acknowledge(anomaly_id: str):
    if not update_record(anomaly_id, {"acknowledged": True}):
        raise HTTPException(status_code=404, detail="Anomaly not found")
    return {"ok": True, "id": anomaly_id}


@router.post("/{anomaly_id}/explain")
def explain(anomaly_id: str):
    rec = get_record(anomaly_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Anomaly not found")
    try:
        text = explain_anomaly_with_llm(rec)
    except Exception as exc:
        logger.exception("Explain failed")
        raise HTTPException(
            status_code=503,
            detail=f"LLM unavailable: {exc}. Ensure Ollama is running with llama3.",
        ) from exc
    update_record(
        anomaly_id,
        {
            "explanation": text,
            "explained_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return {"id": anomaly_id, "explanation": text}


@router.get("/series")
def series(limit: int = Query(default=168, ge=24, le=2000)):
    df = load_gold_tail(limit)
    if df.empty:
        return {"points": []}
    col = "Electricity consumption (MWh)"
    vals = df[col].astype(float).values
    rolling = pd.Series(vals).rolling(24, min_periods=6).mean().values
    points: List[Dict[str, Any]] = []
    for i, row in df.iterrows():
        ts = pd.to_datetime(row["_dt"], utc=True)
        base = float(rolling[i]) if not np.isnan(rolling[i]) else float(row[col])
        res = float(row[col]) - base if not np.isnan(rolling[i]) else 0.0
        points.append(
            {
                "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "label": ts.strftime("%m-%d %H:%M"),
                "mwh": float(row[col]),
                "baseline": base,
                "residual": round(res, 4),
            }
        )
    return {"points": points}


class RescanBody(BaseModel):
    tail_rows: int = Field(default=336, ge=24, le=5000)
    use_llm: bool = True


@router.post("/rescan-tail")
def rescan_tail(body: RescanBody | None = None):
    body = body or RescanBody()
    df = load_gold_tail(body.tail_rows + ROLLBACK + 50)
    if len(df) < MIN_PRIOR + 5:
        return {"logged": 0, "ids": [], "message": "Not enough rows in gold_standard.csv"}
    tail = df.iloc[-body.tail_rows :].copy()
    ids = run_post_ingest_anomaly_scan(
        tail,
        df,
        "rescan-tail",
        use_llm_scan=body.use_llm,
    )
    return {"logged": len(ids), "ids": ids}
