import urllib.request
import json

BASE_URL = "http://localhost:8000"

def test_compare():
    print("Testing GET /pipeline/compare...")
    req = urllib.request.Request(f"{BASE_URL}/pipeline/compare")
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(f"Success! Found {len(data.get('comparison', []))} versions.")
            for v in data.get('comparison', []):
                print(f" - Version: {v['version']}, Active: {v['is_active']}, MAPE: {v['mape']}, Forecast Length: {len(v['forecast'])}")
    except Exception as e:
        print(f"Error calling /compare: {e}")

def test_revert():
    print("\nTesting POST /pipeline/registry/revert...")
    req = urllib.request.Request(f"{BASE_URL}/pipeline/registry/revert", method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(f"Success! {data.get('message')}")
            print(f"Active version is now: {data.get('active_version')}")
    except urllib.error.HTTPError as e:
        # 400 is expected if we're on v1 and there's no parent to revert to.
        err_msg = e.read().decode()
        print(f"HTTPError calling /revert ({e.code}): {err_msg}")
    except Exception as e:
        print(f"Error calling /revert: {e}")

if __name__ == "__main__":
    test_compare()
    test_revert()
