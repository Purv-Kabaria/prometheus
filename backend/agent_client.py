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

async def run_mcp_agent_workflow(user_prompt: str = None):
    """
    Full Agentic Loop using Ollama as the brain and MCP as the tool provider.
    """
    server_script = os.path.join(os.path.dirname(__file__), "mcp_server.py")
    
    server_params = StdioServerParameters(
        command="python",
        args=[server_script]
    )

    ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

    # Fast check if Ollama daemon is running
    try:
        import urllib.request
        check_url = ollama_host if ollama_host.endswith("/") else ollama_host + "/"
        urllib.request.urlopen(check_url, timeout=2)
    except Exception:
        return {"status": "error", "message": f"Ollama server is not responding at {ollama_host}. If running via Docker, it may still be downloading the llama3 model."}

    ollama_client = AsyncClient(host=ollama_host)
    
    # Use the custom prompt if provided, otherwise default
    final_prompt = user_prompt if user_prompt else "Please analyze the grid state for the next 6 hours and propose any necessary actions."

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
                            "You have access to tools to fetch demand forecasts, check committed generation, and schedule maintenance. "
                            "Follow the user's specific prompt. Use tools to gather data if necessary. "
                            "If you determine an action is needed based on the user's request (like a curtailment), use the propose_grid_action tool. "
                            "Provide a clear rationale. Do NOT ask the user for permission to call tools, just execute them."
                        )
                    },
                    {
                        "role": "user",
                        "content": final_prompt
                    }
                ]
                
                print(f"[Agent] Connecting to Ollama at {ollama_host}...")
                try:
                    response = await ollama_client.chat(
                        model='qwen2.5:3b',
                        messages=messages,
                        tools=ollama_tools
                    )
                except Exception as ollama_err:
                    print(f"[Agent] Ollama Error: {ollama_err}")
                    return {"status": "error", "message": f"Ollama Error: {str(ollama_err)}. If running via Docker, it may still be downloading the model."}
                
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
                    try:
                        response = await ollama_client.chat(
                            model='qwen2.5:3b',
                            messages=messages,
                            tools=ollama_tools
                        )
                    except Exception as ollama_err:
                        print(f"[Agent] Ollama Error: {ollama_err}")
                        return {"status": "error", "message": f"Ollama Error during tool loop: {str(ollama_err)}"}
                        
                    messages.append(response['message'])

                print("[Agent] Workflow complete.")
                return {
                    "status": "success", 
                    "message": "Agent workflow completed.", 
                    "final_response": response['message'].get('content', '')
                }

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[Agent] Full Error Traceback:\n{tb}")
        return {"status": "error", "message": f"Agent workflow failed: {str(e)}"}
