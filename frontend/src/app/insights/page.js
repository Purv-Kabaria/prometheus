"use client";

import Card from "@/components/Card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useIsClient } from "@/hooks/useIsClient";

export default function InsightsPage() {
  const isClient = useIsClient();
  // Share of total split gain per feature for the day-ahead LightGBM model,
  // from backend/analysis/day_ahead_evaluation.json (scripts/evaluate_day_ahead.py).
  // Every feature is at least 24 hours old at prediction time, so nothing here
  // can leak the value being forecast.
  const gainShare = {
    lag_24: 56.4, lag_168: 13.65, dow: 4.58, lag_48: 4.19, roll_mean_168: 3.8,
    month_cos: 3.21, roll_mean_24: 3.07, lag_336: 2.38, lag_72: 2.15, hour_sin: 1.86,
  };
  const importanceData = Object.entries(gainShare).map(([feature, contribution]) => ({ feature, contribution }));

  return (
    <div style={{ paddingBottom: "80px" }}>
      <header style={{ marginBottom: "48px" }}>
        <h1 className="serif" style={{ fontSize: "36px", fontWeight: "400", marginBottom: "8px" }}>Model insights</h1>
        <p style={{ color: "var(--muted)", fontSize: "15px" }}>How accurate the day-ahead forecast is, and what it relies on</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginBottom: "48px" }}>
        <Card title="Day-ahead MAPE" value="2.59%" subtext="LightGBM on held-out 2021, features 24h+ old" accentColor="var(--success)" />
        <Card title="Naive baseline" value="3.73%" subtext="Same hour yesterday, same test year" accentColor="var(--primary)" />
        <Card title="Error reduction" value="30%" subtext="vs the best naive forecast" accentColor="var(--warning)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "48px", alignItems: "start" }}>
        {/* Feature importance panel */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "32px" }}>
          <div style={{ marginBottom: "32px" }}>
            <h3 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Feature importance (share of gain)</h3>
            <p style={{ color: "var(--muted)", fontSize: "13px", marginTop: "4px" }}>
              Share of total split gain per feature in the day-ahead model (top 10). Daily (lag_24) and weekly (lag_168) history dominate, matching the periodogram.
            </p>
          </div>
          
          <div style={{ height: 320 }}>
            {isClient ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={importanceData} margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--surface-border)" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} />
                <YAxis type="category" dataKey="feature" axisLine={false} tickLine={false} tick={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 500 }} />
                <Tooltip cursor={{ fill: "var(--accent)" }} contentStyle={{ background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--surface-border)", fontSize: "12px" }} />
                <Bar dataKey="contribution" name="Contribution %" fill="var(--primary)" barSize={20} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            ) : <div style={{ width: "100%", height: "100%", minHeight: 320 }} />}
          </div>
        </div>

        {/* Demand Trend Analysis */}
        <aside style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "24px" }}>
            <h4 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>
              How this was measured
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ borderTop: "1px solid var(--surface-border)", paddingTop: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase" }}>Horizon</div>
                <p style={{ fontSize: "13px", color: "var(--foreground)", marginTop: "6px", lineHeight: "1.5" }}>24 hours ahead. Every input is at least a day old when the forecast is made.</p>
              </div>
              <div style={{ borderTop: "1px solid var(--surface-border)", paddingTop: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase" }}>Split</div>
                <p style={{ fontSize: "13px", color: "var(--foreground)", marginTop: "6px", lineHeight: "1.5" }}>Train 2016-2019, tune on 2020, test once on 2021. Never shuffled.</p>
              </div>
              <div style={{ borderTop: "1px solid var(--surface-border)", paddingTop: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase" }}>Validation vs test</div>
                <p style={{ fontSize: "13px", color: "var(--foreground)", marginTop: "6px", lineHeight: "1.5" }}>2.59% on both, so the model is not overfitting the tuning year.</p>
              </div>
              <div style={{ borderTop: "1px solid var(--surface-border)", paddingTop: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase" }}>Baselines</div>
                <p style={{ fontSize: "13px", color: "var(--foreground)", marginTop: "6px", lineHeight: "1.5" }}>Same hour yesterday 3.73%, same hour last week 5.75%.</p>
              </div>
              <div style={{ borderTop: "1px solid var(--surface-border)", paddingTop: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase" }}>Reproduce</div>
                <p style={{ fontSize: "13px", color: "var(--foreground)", marginTop: "6px", lineHeight: "1.5" }}>backend/scripts/evaluate_day_ahead.py</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
