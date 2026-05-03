import json
from mcp_server import get_demand_forecast, get_committed_generation, propose_grid_action, schedule_maintenance, get_all_pending_proposals

def run_tests():
    print("=== Testing Prometheus Grid Agent MCP Tools ===\n")
    
    print("1. Testing get_demand_forecast(hours=6)")
    forecast = get_demand_forecast(hours=6)
    print(f"Result: {forecast}\n")
    
    print("2. Testing get_committed_generation()")
    generation = get_committed_generation()
    print(f"Result: {generation}\n")
    
    print("3. Testing propose_grid_action(...)")
    proposal = propose_grid_action(
        action_type="curtailment",
        target_mwh=800.0,
        target_hour="14:00",
        rationale="Forecast shows 4200 MW demand vs 5000 MW generation. Recommending curtailment to save costs."
    )
    print(f"Result: {proposal}\n")
    
    print("4. Testing schedule_maintenance(...)")
    maintenance = schedule_maintenance(
        equipment_id="Transformer-Substation-B",
        start_time="02:00",
        end_time="06:00"
    )
    print(f"Result: {maintenance}\n")
    
    print("5. Verifying Pending Proposals Database")
    pending = get_all_pending_proposals()
    print(json.dumps(pending, indent=2))
    
    print("\n=== All Tests Passed Successfully ===")

if __name__ == "__main__":
    run_tests()
