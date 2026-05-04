import os
import urllib.request
import json
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from .env file (override existing OS vars)
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(env_path, override=True)

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
if not OLLAMA_HOST.startswith("http://") and not OLLAMA_HOST.startswith("https://"):
    OLLAMA_HOST = "http://" + OLLAMA_HOST

OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")

def test_ollama_connection():
    print(f"Testing connection to Ollama host: {OLLAMA_HOST}")
    print(f"Target model: {OLLAMA_MODEL}")
    print("-" * 40)
    
    # 1. Test basic server connectivity
    try:
        check_url = OLLAMA_HOST if OLLAMA_HOST.endswith("/") else OLLAMA_HOST + "/"
        response = urllib.request.urlopen(check_url, timeout=5)
        print("[SUCCESS] Server is reachable. Status:", response.status)
        print("          Message:", response.read().decode('utf-8').strip())
    except Exception as e:
        print("[ERROR] Failed to reach Ollama server.")
        print("        Error:", e)
        return

    # 2. Test model generation (simple prompt)
    print("\nTesting model completion generation...")
    try:
        import ollama
        client = ollama.Client(host=OLLAMA_HOST)
        
        response = client.generate(
            model=OLLAMA_MODEL,
            prompt='Hello, this is a test. Please respond with "Test successful!".',
            options={"temperature": 0.1}
        )
        
        print("[SUCCESS] Model generated a response successfully!")
        print(f"          Response from {OLLAMA_MODEL}:\n          {response.get('response', '').strip()}")
        
    except ImportError:
        print("[ERROR] 'ollama' python package is not installed.")
        print("        To test model generation, install it via: pip install ollama")
    except Exception as e:
        print(f"[ERROR] Failed to generate response from model '{OLLAMA_MODEL}'.")
        print("        Make sure the model is pulled and available on the server.")
        print("        Error:", e)

if __name__ == "__main__":
    test_ollama_connection()
