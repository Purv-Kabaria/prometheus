from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import sys
import os

# Ensure we can import from parent dir
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mcp_server import PENDING_PROPOSALS, propose_grid_action

router = APIRouter(prefix="/api/agent", tags=["Agent Decisions"])

class FeedbackRequest(BaseModel):
    proposal_id: str
    status: str # "accepted", "rejected", "overridden"
    reason: Optional[str] = None
    overridden_mwh: Optional[float] = None

@router.post("/trigger")
def trigger_agent():
    """Stub to trigger the agent manually without an LLM"""
    # Simply call the MCP tool directly to generate a mock proposal
    propose_grid_action(
        action_type="curtailment",
        target_mwh=650.0,
        target_hour="15:00",
        rationale="Forecast shows demand dropping by 600 MW due to high solar output. Recommending curtailment to prevent over-generation."
    )
    return {"status": "success", "message": "Agent triggered. Check proposals."}

@router.get("/proposals")
def get_proposals():
    """Fetch all pending proposals for the dashboard"""
    return {"proposals": [p for p in PENDING_PROPOSALS if p["status"] == "pending_approval"]}

@router.post("/feedback")
def submit_feedback(req: FeedbackRequest):
    """Handle officer feedback"""
    for prop in PENDING_PROPOSALS:
        if prop["id"] == req.proposal_id:
            prop["status"] = req.status
            if req.reason:
                prop["officer_reason"] = req.reason
            if req.overridden_mwh:
                prop["overridden_mwh"] = req.overridden_mwh
            return {"status": "success", "message": f"Proposal {req.proposal_id} resolved as {req.status}."}
    
    raise HTTPException(status_code=404, detail="Proposal not found")
