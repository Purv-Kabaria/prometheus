import pandas as pd

# Load dataset
file_path = "./Adani_Datasets/Hourly_Consumption.xlsx"
df = pd.read_excel(file_path)

# Convert datetime columns
df["Start time UTC"] = pd.to_datetime(df["Start time UTC"])
df["End time UTC"] = pd.to_datetime(df["End time UTC"])

# Set index
df.set_index("Start time UTC", inplace=True)

cons_col = "Electricity consumption (MWh)"

# -------------------------------
# Function to create dataset
# -------------------------------
def create_aggregated(df, freq, output_file):
    agg = df[cons_col].resample(freq).sum().to_frame()

    # Start time
    agg["Start time UTC"] = agg.index

    # End time = next period start
    agg["End time UTC"] = agg["Start time UTC"].shift(-1)

    # Drop last row (no end time)
    agg = agg[:-1]

    # Reorder columns
    agg = agg[["Start time UTC", "End time UTC", cons_col]]

    # Save
    agg.to_excel(output_file, index=False)


# -------------------------------
# Generate all datasets
# -------------------------------

create_aggregated(df, "D", "daily_consumption.xlsx")
create_aggregated(df, "W", "weekly_consumption.xlsx")
create_aggregated(df, "M", "monthly_consumption.xlsx")
create_aggregated(df, "Y", "yearly_consumption.xlsx")

print("All datasets generated successfully!")