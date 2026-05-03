from mcp.server.fastmcp import FastMCP
import json
import random
import sys
import os

# Ensure we can import from local directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import add_proposal

# Initialize the FastMCP server for the Grid Agent
mcp = FastMCP("PrometheusGridAgent")

@mcp.tool()
def get_demand_forecast(hours: int = 24) -> str:
    """Get the hourly demand forecast for the specified number of hours."""
    # Mocking a scenario where demand is dropping significantly
    forecast = [4200 + random.randint(-100, 100) for _ in range(hours)]
    return json.dumps({"status": "success", "forecast": forecast, "unit": "MW"})

@mcp.tool()
def get_committed_generation() -> str:
    """Get the currently committed power generation for the grid."""
    return json.dumps({"status": "success", "generation_mwh": 5000, "unit": "MW"})

@mcp.tool()
def propose_grid_action(action_type: str, target_mwh: float, target_hour: str, rationale: str) -> str:
    """
    Propose a grid action (like curtailment or reserve deployment) to the grid officer.
    This does NOT execute the action automatically. It places it in a pending state.
    """
    proposal_id = f"prop_{random.randint(1000, 9999)}"
    proposal = {
        "id": proposal_id,
        "action_type": action_type,
        "target_mwh": target_mwh,
        "target_hour": target_hour,
        "rationale": rationale,
        "status": "pending_approval"
    }
    
    # Store in JSON database so it crosses process boundaries
    add_proposal(proposal)
    
    return json.dumps({
        "status": "success", 
        "message": "Proposal successfully submitted to the Grid Officer Dashboard for approval.", 
        "proposal_id": proposal_id
    })

@mcp.tool()
def schedule_maintenance(equipment_id: str, start_time: str, end_time: str) -> str:
    """Propose a maintenance schedule for grid equipment during predicted low-demand windows."""
    proposal_id = f"maint_{random.randint(1000, 9999)}"
    proposal = {
        "id": proposal_id,
        "action_type": "maintenance",
        "equipment_id": equipment_id,
        "start_time": start_time,
        "end_time": end_time,
        "status": "pending_approval"
    }
    add_proposal(proposal)
    
    return json.dumps({
        "status": "success", 
        "message": "Maintenance proposal submitted to dashboard.", 
        "proposal_id": proposal_id
    })

if __name__ == "__main__":
    mcp.run()
