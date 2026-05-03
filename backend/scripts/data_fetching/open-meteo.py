import requests
import time
import csv

# Mapping states to centroids
state_coords = {
    "Andhra Pradesh": (15.9129, 79.7400),
    "Arunachal Pradesh": (28.2180, 94.7278),
    "Assam": (26.2006, 92.9376),
    "Bihar": (25.0961, 85.3131),
    "Chhattisgarh": (21.2787, 81.8661),
    "Goa": (15.2993, 74.1240),
    "Gujarat": (22.2587, 71.1924),
    "Haryana": (29.0588, 76.0856),
    "Himachal Pradesh": (31.1048, 77.1734),
    "Jharkhand": (23.6102, 85.2799),
    "Karnataka": (15.3173, 75.7139),
    "Kerala": (10.8505, 76.2711),
    "Madhya Pradesh": (22.9734, 78.6569),
    "Maharashtra": (19.7515, 75.7139),
    "Manipur": (24.6637, 93.9063),
    "Meghalaya": (25.4670, 91.3662),
    "Mizoram": (23.1645, 92.9376),
    "Nagaland": (26.1584, 94.5624),
    "Odisha": (20.9517, 85.0985),
    "Punjab": (31.1471, 75.3412),
    "Rajasthan": (27.0238, 74.2179),
    "Sikkim": (27.5330, 88.5122),
    "Tamil Nadu": (11.1271, 78.6569),
    "Telangana": (17.1232, 79.2088),
    "Tripura": (23.9408, 91.9882),
    "Uttarakhand": (30.0668, 79.0193),
    "Uttar Pradesh": (26.8467, 80.9462),
    "West Bengal": (22.9868, 87.8550)
}

# The expanded feature set for deep feature engineering
FEATURES = (
    "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,"
    "snowfall,weather_code,pressure_msl,surface_pressure,cloud_cover,"
    "cloud_cover_low,cloud_cover_mid,cloud_cover_high,vapour_pressure_deficit,"
    "wind_speed_10m,wind_direction_10m,wind_gusts_10m,shortwave_radiation,"
    "direct_radiation,diffuse_radiation,direct_normal_irradiance,"
    "sunshine_duration,is_day"
)

def fetch_weather_data(state, lat, lon, year, output_file):
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": f"{year}-01-01",
        "end_date": f"{year}-12-31",
        "hourly": FEATURES,
        "timezone": "Asia/Kolkata"
    }
    
    response = requests.get(url, params=params)
    if response.status_code == 200:
        data = response.json()
        hourly = data.get("hourly", {})
        
        # Prepare headers for the first time
        keys = ["state", "year"] + list(hourly.keys())
        
        # Write rows
        with open(output_file, 'a', newline='') as f:
            writer = csv.writer(f)
            # Find the number of records (length of 'time' array)
            num_records = len(hourly.get("time", []))
            for i in range(num_records):
                row = [state, year] + [hourly[key][i] for key in hourly.keys()]
                writer.writerow(row)
        return True
    else:
        print(f"Error for {state} {year}: {response.status_code}")
        return False

# Execution
output_csv = "open_meteo_2025.csv"
# Initialize file with headers
with open(output_csv, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(["state", "year"] + FEATURES.split(','))

for state, (lat, lon) in state_coords.items():
    for year in [2025]:
        print(f"Fetching {state} ({year})...")
        if fetch_weather_data(state, lat, lon, year, output_csv):
            time.sleep(10) # Safe rate limiting

print("Retrieval complete.")