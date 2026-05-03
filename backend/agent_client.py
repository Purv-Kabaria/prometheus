import asyncio
import json
import os
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from ollama import AsyncClient

def mcp_tool_to_ollama(tool):
    """Convert an MCP Tool schema to Ollama's tool schema"""
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.inputSchema
        }
    }

async def run_mcp_agent_workflow():
    """
    Full Agentic Loop using Ollama as the brain and MCP as the tool provider.
    """
    server_script = os.path.join(os.path.dirname(__file__), "mcp_server.py")
    
    server_params = StdioServerParameters(
        command="python",
        args=[server_script]
    )

    # Use environment variable for Docker compatibility, default to localhost
    ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

    # Fast check if Ollama daemon is running
    try:
        import urllib.request
        check_url = ollama_host if ollama_host.endswith("/") else ollama_host + "/"
        urllib.request.urlopen(check_url, timeout=2)
    except Exception:
        return {"status": "error", "message": f"Ollama server is not responding at {ollama_host}. If running via Docker, it may still be downloading the llama3 model."}

    ollama_client = AsyncClient(host=ollama_host)

    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                mcp_tools_response = await session.list_tools()
                ollama_tools = [mcp_tool_to_ollama(t) for t in mcp_tools_response.tools]
                
                messages = [
                    {
                        "role": "system",
                        "content": (
                            "You are the Prometheus Grid Agent, an advanced AI assisting grid operations officers. "
                            "You have access to tools to fetch demand forecasts and committed generation. "
                            "First, gather the committed generation and the demand forecast for the next 6 hours. "
                            "If the generation is significantly higher than the average demand forecast (by >300 MW), "
                            "you MUST use the propose_grid_action tool to propose a 'curtailment' action to save costs. "
                            "Provide a clear rationale. Do NOT ask the user for permission to call tools, just execute them."
                        )
                    },
                    {
                        "role": "user",
                        "content": "Please analyze the grid state for the next 6 hours and propose any necessary actions."
                    }
                ]
                
                print(f"[Agent] Connecting to Ollama at {ollama_host}...")
                response = await ollama_client.chat(
                    model='llama3',
                    messages=messages,
                    tools=ollama_tools
                )
                
                messages.append(response['message'])
                
                while response.get('message', {}).get('tool_calls'):
                    tool_calls = response['message']['tool_calls']
                    
                    for tool_call in tool_calls:
                        tool_name = tool_call['function']['name']
                        tool_args = tool_call['function']['arguments']
                        
                        print(f"[Agent] Calling MCP Tool: {tool_name} with args: {tool_args}")
                        
                        try:
                            tool_result = await session.call_tool(tool_name, arguments=tool_args)
                            if hasattr(tool_result, 'content') and len(tool_result.content) > 0:
                                content = tool_result.content[0].text
                            else:
                                content = str(tool_result)
                        except Exception as e:
                            content = json.dumps({"error": str(e)})
                            
                        print(f"[Agent] Tool result: {content}")
                        
                        messages.append({
                            "role": "tool",
                            "name": tool_name,
                            "content": content
                        })
                    
                    print("[Agent] Sending tool results back to Ollama...")
                    response = await ollama_client.chat(
                        model='llama3',
                        messages=messages,
                        tools=ollama_tools
                    )
                    messages.append(response['message'])

                print("[Agent] Workflow complete.")
                return {
                    "status": "success", 
                    "message": "Agent workflow completed.", 
                    "final_response": response['message'].get('content', '')
                }

    except Exception as e:
        print(f"[Agent] Error: {str(e)}")
        return {"status": "error", "message": f"Agent workflow failed: {str(e)}"}
