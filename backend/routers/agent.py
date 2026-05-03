from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import load_proposals, update_proposal
from agent_client import run_mcp_agent_workflow

router = APIRouter(prefix="/api/agent", tags=["Agent Decisions"])

class FeedbackRequest(BaseModel):
    proposal_id: str
    status: str # "accepted", "rejected", "overridden"
    reason: Optional[str] = None
    overridden_mwh: Optional[float] = None

class TriggerRequest(BaseModel):
    prompt: Optional[str] = None

@router.post("/trigger")
async def trigger_agent(req: TriggerRequest = None):
    """
    Triggers the full MCP Agent workflow.
    The client spins up the MCP server via stdio, fetches data using tools,
    makes a decision based on the optional user prompt, and uses tools to propose the action.
    """
    prompt = req.prompt if req else None
    result = await run_mcp_agent_workflow(prompt)
    return {"status": "success", "message": "Agent triggered via MCP Protocol.", "details": result}

@router.get("/proposals")
def get_proposals():
    """Fetch all pending proposals from the shared JSON database"""
    proposals = load_proposals()
    return {"proposals": [p for p in proposals if p["status"] == "pending_approval"]}

@router.post("/feedback")
def submit_feedback(req: FeedbackRequest):
    """Handle officer feedback and update the JSON database"""
    updates = {"status": req.status}
    if req.reason:
        updates["officer_reason"] = req.reason
    if req.overridden_mwh:
        updates["overridden_mwh"] = req.overridden_mwh
        
    success = update_proposal(req.proposal_id, updates)
    if success:
        return {"status": "success", "message": f"Proposal {req.proposal_id} resolved as {req.status}."}
    
    raise HTTPException(status_code=404, detail="Proposal not found")
