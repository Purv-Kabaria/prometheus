FROM python:3.11-slim

WORKDIR /app

# Layer 1: Core data science & API packages (always required, always installed)
RUN pip install --default-timeout=100 --no-cache-dir \
    numpy pandas scipy scikit-learn \
    lightgbm xgboost \
    statsmodels pmdarima \
    fastapi uvicorn pydantic \
    mcp ollama

# Layer 2: Optional heavy ML packages (torch etc) — failure is acceptable, model falls back to synthetic
COPY requirements.txt ./
RUN pip install --default-timeout=100 --no-cache-dir -r requirements.txt || echo "Some optional packages failed — continuing with fallback mode."

# Copy the backend code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Start server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
