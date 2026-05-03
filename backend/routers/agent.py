from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict
import asyncio
import uuid
from datetime import datetime, timezone
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import load_proposals, update_proposal
from agent_client import run_mcp_agent_workflow

router = APIRouter(prefix="/api/agent", tags=["Agent Decisions"])

# ── In-memory job tracker ─────────────────────────────────────────────────────
# Acceptable for single-instance deployment; survives for the session lifetime.
_AGENT_JOBS: Dict[str, dict] = {}


class FeedbackRequest(BaseModel):
    proposal_id: str
    status: str  # "accepted" | "rejected" | "overridden"
    reason: Optional[str] = None
    overridden_mwh: Optional[float] = None


class TriggerRequest(BaseModel):
    prompt: Optional[str] = None


@router.post("/trigger")
async def trigger_agent(req: TriggerRequest = None):
    """
    Starts the MCP Agent workflow as a background asyncio task.
    Returns a job_id immediately — the frontend polls /status/{job_id}.
    This prevents the 30-90s agent inference from blocking the event loop.
    """
    prompt = req.prompt if req else None
    job_id = str(uuid.uuid4())

    _AGENT_JOBS[job_id] = {
        "job_id":     job_id,
        "status":     "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "details":    None,
    }

    async def _run():
        try:
            result = await run_mcp_agent_workflow(prompt)
            _AGENT_JOBS[job_id]["details"] = result
            _AGENT_JOBS[job_id]["status"]  = "done"
        except Exception as exc:
            _AGENT_JOBS[job_id]["status"]  = "error"
            _AGENT_JOBS[job_id]["details"] = {"status": "error", "message": str(exc)}
        _AGENT_JOBS[job_id]["finished_at"] = datetime.now(timezone.utc).isoformat()

    asyncio.create_task(_run())

    return {
        "status":  "accepted",
        "job_id":  job_id,
        "message": "Agent workflow started. Poll /api/agent/status/{job_id} for results.",
    }


@router.get("/status/{job_id}")
def get_agent_status(job_id: str):
    """Poll this endpoint after triggering the agent."""
    job = _AGENT_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Agent job not found.")
    return job


@router.get("/proposals")
def get_proposals():
    """Fetch all pending proposals from the SQLite database."""
    proposals = load_proposals()
    return {"proposals": [p for p in proposals if p.get("status") == "pending_approval"]}


@router.post("/feedback")
def submit_feedback(req: FeedbackRequest):
    """Handle officer feedback and update the proposal record."""
    updates = {"status": req.status}
    if req.reason:
        updates["officer_reason"] = req.reason
    if req.overridden_mwh:
        updates["overridden_mwh"] = req.overridden_mwh

    success = update_proposal(req.proposal_id, updates)
    if success:
        return {"status": "success", "message": f"Proposal {req.proposal_id} resolved as {req.status}."}

    raise HTTPException(status_code=404, detail="Proposal not found.")
