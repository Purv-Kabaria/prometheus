export const generateHourly = () => {
  const data = [];
  const base = new Date("2024-01-01T00:00:00Z");
  for (let i = 0; i < 168; i++) {
    const t = new Date(base.getTime() + i * 3600000);
    const hour = t.getUTCHours();
    const dayFactor = [0, 1, 2, 5, 6].includes(t.getUTCDay()) ? 0.75 : 1;
    const hourFactor = hour < 6 ? 0.5 : hour < 9 ? 0.85 : hour < 18 ? 1.0 : hour < 22 ? 0.9 : 0.6;
    const noise = 0.85 + Math.random() * 0.3;
    const value = +(120 * dayFactor * hourFactor * noise).toFixed(2);
    const prediction = +(120 * dayFactor * hourFactor * 1.05).toFixed(2);
    data.push({
      time: t.toISOString(),
      label: `${t.getUTCMonth() + 1}/${t.getUTCDate()} ${String(t.getUTCHours()).padStart(2, "0")}:00`,
      value,
      prediction,
      residual: +(value - prediction).toFixed(2)
    });
  }
  return data;
};

export const generateDaily = () => {
  const data = [];
  const base = new Date("2024-01-01");
  for (let i = 0; i < 90; i++) {
    const t = new Date(base.getTime() + i * 86400000);
    const isWeekend = [0, 6].includes(t.getUTCDay());
    const trend = 1 + i * 0.002;
    const noise = 0.88 + Math.random() * 0.24;
    const value = +(2400 * (isWeekend ? 0.72 : 1) * trend * noise).toFixed(1);
    const prediction = +(2400 * (isWeekend ? 0.72 : 1) * trend * 1.02).toFixed(1);
    data.push({
      time: t.toISOString(),
      label: `${t.getUTCMonth() + 1}/${t.getUTCDate()}`,
      value,
      prediction,
      residual: +(value - prediction).toFixed(1)
    });
  }
  return data;
};

export const RAW_DATA = {
  Hourly: generateHourly(),
  Daily: generateDaily(),
  Weekly: generateDaily().slice(0, 7),
  Monthly: generateDaily().slice(0, 30),
};

export const fmt = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;

export function computeStats(data) {
  const vals = data.map(d => d.value);
  const total = vals.reduce((a, b) => a + b, 0);
  const mean = total / vals.length;
  const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  const peak = Math.max(...vals);
  return { total, mean, std, peak };
}
