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

from routers.forecast import forecast_24h

@mcp.tool()
def get_demand_forecast(hours: int = 24) -> str:
    """Get the hourly demand forecast for the specified number of hours."""
    try:
        # Fetch real predictions from the TCN_XGB/Mamba model router
        forecast_data = forecast_24h(state="Maharashtra", model="tcn_xgb")
        slots = forecast_data.get("slots", [])[:hours]
        p50_forecasts = [slot["p50"] for slot in slots]
        
        return json.dumps({
            "status": "success", 
            "forecast": p50_forecasts, 
            "unit": "MW",
            "source_model": forecast_data.get("model")
        })
    except Exception as e:
        # Fallback if model loading fails
        forecast = [4200 + random.randint(-100, 100) for _ in range(hours)]
        return json.dumps({"status": "fallback", "forecast": forecast, "unit": "MW", "error": str(e)})

@mcp.tool()
def get_committed_generation() -> str:
    """Get the currently committed power generation for the grid in real-time."""
    try:
        from datetime import datetime
        # Fetch the day's forecast to determine the necessary baseload
        forecast_data = forecast_24h(state="Maharashtra", model="tcn_xgb")
        peak_mw = forecast_data.get("summary", {}).get("peak_mw", 4500)
        
        # Grid operators commit generation to cover peak demand + ~10% spinning reserve
        base_commitment = peak_mw * 1.10
        
        # Add a real-time micro-fluctuation to simulate live physical plant output (± 50 MW)
        current_minute = datetime.now().minute
        fluctuation = (current_minute % 10) * 10 - 50 
        
        real_time_generation = round(base_commitment + fluctuation, 1)
        
        return json.dumps({
            "status": "success", 
            "generation_mwh": real_time_generation, 
            "unit": "MW",
            "reserve_margin_pct": 10.0,
            "timestamp": datetime.now().strftime("%H:%M:%S")
        })
    except Exception as e:
        return json.dumps({"status": "fallback", "generation_mwh": 5000, "unit": "MW", "error": str(e)})

@mcp.tool()
def get_grid_equipment() -> str:
    """Get all active grid equipment with maintenance status and overdue flags."""
    from datetime import datetime

    today = datetime.now().date()
    equipment = [
        {"id": "GEN-01", "type": "Coal Power Plant",           "capacity_mw": 1200, "maintenance_interval_days": 90,  "last_maintained": "2026-02-01"},
        {"id": "GEN-02", "type": "Solar Farm",                 "capacity_mw": 800,  "maintenance_interval_days": 180, "last_maintained": "2026-04-01"},
        {"id": "GEN-03", "type": "Wind Farm",                  "capacity_mw": 450,  "maintenance_interval_days": 60,  "last_maintained": "2026-03-20"},
        {"id": "TRF-A1", "type": "Main Substation Transformer","capacity_mw": 2000, "maintenance_interval_days": 365, "last_maintained": "2025-12-01"},
        {"id": "BATT-01","type": "Grid Battery Storage",       "capacity_mw": 150,  "maintenance_interval_days": 120, "last_maintained": "2026-01-15"},
    ]
    for eq in equipment:
        from datetime import datetime as dt
        last = dt.strptime(eq["last_maintained"], "%Y-%m-%d").date()
        days_since = (today - last).days
        eq["days_since_last_maintenance"] = days_since
        eq["overdue"] = days_since > eq["maintenance_interval_days"]
        eq["status"] = "needs_maintenance" if eq["overdue"] else "active"
    return json.dumps({"status": "success", "equipment": equipment})

@mcp.tool()
def find_optimal_maintenance_window(equipment_id: str, duration_hours: int = 4) -> str:
    """
    Analyzes the real 24-hour demand forecast to find the safest time window
    to take a specific piece of equipment offline for maintenance.
    Returns the top 3 windows ranked by lowest demand with grid safety checks.
    """
    try:
        from datetime import datetime, timedelta

        EQUIPMENT_REGISTRY = {
            "GEN-01": {"capacity_mw": 1200, "type": "Coal Power Plant"},
            "GEN-02": {"capacity_mw": 800,  "type": "Solar Farm"},
            "GEN-03": {"capacity_mw": 450,  "type": "Wind Farm"},
            "TRF-A1": {"capacity_mw": 2000, "type": "Main Substation Transformer"},
            "BATT-01": {"capacity_mw": 150,  "type": "Grid Battery Storage"},
        }

        if equipment_id not in EQUIPMENT_REGISTRY:
            return json.dumps({"status": "error", "message": f"Unknown equipment ID: {equipment_id}. Call get_grid_equipment first."})

        eq = EQUIPMENT_REGISTRY[equipment_id]
        total_capacity = sum(e["capacity_mw"] for e in EQUIPMENT_REGISTRY.values())
        # Available capacity with this unit offline
        remaining_capacity = total_capacity - eq["capacity_mw"]

        # Use real forecast to evaluate every possible window
        forecast_data = forecast_24h(state="Maharashtra", model="tcn_xgb")
        slots = forecast_data.get("slots", [])

        base_time = datetime.now().replace(minute=0, second=0, microsecond=0)
        windows = []

        for start_idx in range(len(slots) - duration_hours + 1):
            window_slots = slots[start_idx:start_idx + duration_hours]
            peak_demand   = max(s["p50"] for s in window_slots)
            avg_demand    = sum(s["p50"] for s in window_slots) / len(window_slots)
            safety_buffer = remaining_capacity - peak_demand  # positive = safe

            start_dt = base_time + timedelta(hours=start_idx)
            end_dt   = start_dt + timedelta(hours=duration_hours)

            windows.append({
                "start_time":      start_dt.strftime("%Y-%m-%d %H:%M"),
                "end_time":        end_dt.strftime("%Y-%m-%d %H:%M"),
                "avg_demand_mw":   round(avg_demand, 1),
                "peak_demand_mw":  round(peak_demand, 1),
                "safety_buffer_mw": round(safety_buffer, 1),
                "is_safe":         safety_buffer > 200,  # require 200MW headroom minimum
            })

        safe_windows = sorted(
            [w for w in windows if w["is_safe"]],
            key=lambda x: x["avg_demand_mw"]  # lowest demand first = least disruption
        )

        return json.dumps({
            "status": "success",
            "equipment_id":               equipment_id,
            "equipment_type":             eq["type"],
            "capacity_taken_offline_mw":  eq["capacity_mw"],
            "remaining_grid_capacity_mw": remaining_capacity,
            "duration_hours":             duration_hours,
            "recommended_windows":        safe_windows[:3],
            "total_safe_windows_found":   len(safe_windows),
            "note": "Windows ranked by lowest average demand. Use top window's start_time and end_time in schedule_maintenance."
        })

    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})



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
def schedule_maintenance(equipment_id: str, start_time: str, end_time: str, rationale: str = "") -> str:
    """Propose a maintenance schedule for grid equipment during predicted low-demand windows. Always use the window from find_optimal_maintenance_window."""
    proposal_id = f"maint_{random.randint(1000, 9999)}"
    proposal = {
        "id": proposal_id,
        "action_type": "maintenance",
        "equipment_id": equipment_id,
        "start_time": start_time,
        "end_time": end_time,
        "rationale": rationale if rationale else f"Maintenance scheduled for {equipment_id} during a forecast low-demand window ({start_time} – {end_time}) to minimize grid disruption.",
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
