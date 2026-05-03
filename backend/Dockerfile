FROM python:3.11-slim

WORKDIR /app

# Install standard dependencies if they exist
COPY requirements.txt ./
RUN pip install --default-timeout=100 --no-cache-dir -r requirements.txt || true

# Install specific dependencies required for the agent and MCP
RUN pip install --default-timeout=100 --no-cache-dir mcp ollama fastapi uvicorn pydantic

# Copy the backend code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Start server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
