import pandas as pd
import matplotlib.pyplot as plt

# -------------------------------
# Load datasets
# -------------------------------
hourly = pd.read_excel("./Adani_Datasets/hourly_consumption.xlsx")
daily = pd.read_excel("./Adani_Datasets/daily_consumption.xlsx")
weekly = pd.read_excel("./Adani_Datasets/weekly_consumption.xlsx")
monthly = pd.read_excel("./Adani_Datasets/monthly_consumption.xlsx")
yearly = pd.read_excel("./Adani_Datasets/yearly_consumption.xlsx")

# Convert to datetime
for df in [hourly, daily, weekly, monthly, yearly]:
    df["Start time UTC"] = pd.to_datetime(df["Start time UTC"])

cons_col = "Electricity consumption (MWh)"

# -------------------------------
# Create subplots (single screen)
# -------------------------------
fig, axes = plt.subplots(5, 1, figsize=(12, 18))

datasets = [
    (hourly, "Hourly"),
    (daily, "Daily"),
    (weekly, "Weekly"),
    (monthly, "Monthly"),
    (yearly, "Yearly"),
]

for ax, (df, title) in zip(axes, datasets):
    ax.plot(df["Start time UTC"], df[cons_col])
    ax.set_title(f"{title} Electricity Consumption")
    ax.set_xlabel("Time")
    ax.set_ylabel("MWh")
    ax.tick_params(axis='x', rotation=45)

plt.tight_layout()
plt.show()