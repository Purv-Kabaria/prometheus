from mcp.server.fastmcp import FastMCP
import json
import random

# Initialize the FastMCP server for the Grid Agent
mcp = FastMCP("PrometheusGridAgent")

# Mock database for pending proposals
PENDING_PROPOSALS = []

@mcp.tool()
def get_demand_forecast(hours: int = 24) -> str:
    """Get the hourly demand forecast for the specified number of hours."""
    # In a real implementation, this would query the LightGBM/BiLSTM models
    # Here we mock a scenario where demand is dropping significantly
    forecast = [4200 + random.randint(-100, 100) for _ in range(hours)]
    return json.dumps({"status": "success", "forecast": forecast, "unit": "MW"})

@mcp.tool()
def get_committed_generation() -> str:
    """Get the currently committed power generation for the grid."""
    # Mocking a static commitment of 5000 MW
    return json.dumps({"status": "success", "generation_mwh": 5000, "unit": "MW"})

@mcp.tool()
def propose_grid_action(action_type: str, target_mwh: float, target_hour: str, rationale: str) -> str:
    """
    Propose a grid action (like curtailment or reserve deployment) to the grid officer.
    This does NOT execute the action automatically. It places it in a pending state
    for human review.
    
    Args:
        action_type: Type of action (e.g., 'curtailment', 'deploy_reserves')
        target_mwh: The amount of energy in MWh to adjust
        target_hour: The time the action should take place (e.g., '14:00')
        rationale: A detailed, plain-English reason for why this action is necessary
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
    
    # Store in our mock database
    PENDING_PROPOSALS.append(proposal)
    
    return json.dumps({
        "status": "success", 
        "message": "Proposal successfully submitted to the Grid Officer Dashboard for approval.", 
        "proposal_id": proposal_id
    })

@mcp.tool()
def schedule_maintenance(equipment_id: str, start_time: str, end_time: str) -> str:
    """
    Propose a maintenance schedule for grid equipment during predicted low-demand windows.
    """
    proposal_id = f"maint_{random.randint(1000, 9999)}"
    proposal = {
        "id": proposal_id,
        "action_type": "maintenance",
        "equipment_id": equipment_id,
        "start_time": start_time,
        "end_time": end_time,
        "status": "pending_approval"
    }
    PENDING_PROPOSALS.append(proposal)
    
    return json.dumps({
        "status": "success", 
        "message": "Maintenance proposal submitted to dashboard.", 
        "proposal_id": proposal_id
    })

def get_all_pending_proposals():
    """Helper function to retrieve proposals (to be used by FastAPI endpoints)"""
    return PENDING_PROPOSALS

if __name__ == "__main__":
    print("Starting Prometheus Grid Agent MCP Server...")
    # This will run the server using stdio transport by default, 
    # which is exactly what MCP clients expect
    mcp.run()
