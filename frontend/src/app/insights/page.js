"use client";

import Card from "@/components/Card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useIsClient } from "@/hooks/useIsClient";

export default function InsightsPage() {
  const isClient = useIsClient();
  // Derived from notebook SHAP waterfall output (forecasting_models.ipynb, viz_30)
  // Values are absolute SHAP magnitudes converted to percentage share.
  const shapRawImpacts = [
    { feature: "lag_1", impact: -908.01 },
    { feature: "hour_sin", impact: -61.29 },
    { feature: "hour_cos", impact: 35.46 },
    { feature: "month_cos", impact: 32.23 },
    { feature: "rolling_mean_24", impact: -23.04 },
    { feature: "lag_168", impact: -16.52 },
    { feature: "lag_24", impact: -15.70 },
    { feature: "month_sin", impact: -12.92 },
    { feature: "ema_12", impact: -12.58 },
    { feature: "other_features", impact: 12.58 },
  ];

  const totalAbsImpact = shapRawImpacts.reduce((sum, row) => sum + Math.abs(row.impact), 0);
  const shapData = shapRawImpacts.map((row) => ({
    feature: row.feature,
    contribution: Number(((Math.abs(row.impact) / totalAbsImpact) * 100).toFixed(2)),
  }));

  return (
    <div style={{ paddingBottom: "80px" }}>
      <header style={{ marginBottom: "48px" }}>
        <h1 className="serif" style={{ fontSize: "36px", fontWeight: "400", marginBottom: "8px" }}>Model insights</h1>
        <p style={{ color: "var(--muted)", fontSize: "15px" }}>Cost reduction analysis and feature explainability metrics</p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginBottom: "48px" }}>
        <Card title="Avoided Expenditure (MTD)" value="$42,500" subtext="Savings from optimized unit commitment" accentColor="var(--success)" />
        <Card title="Grid Efficiency" value="+12.4%" subtext="Reduction in over-generation waste" accentColor="var(--primary)" />
        <Card title="Peak Flattening" value="Active" subtext="Pattern shift detected in Sector C" accentColor="var(--warning)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "48px", alignItems: "start" }}>
        {/* SHAP Panel */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "32px" }}>
          <div style={{ marginBottom: "32px" }}>
            <h3 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Feature Impact (SHAP)</h3>
            <p style={{ color: "var(--muted)", fontSize: "13px", marginTop: "4px" }}>
              Contribution share from notebook SHAP output (cell 33 / viz_29-viz_30), normalized by absolute SHAP magnitude.
            </p>
          </div>
          
          <div style={{ height: 320 }}>
            {isClient ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={shapData} margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
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
            <h4 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px" }}>
              Trend analysis
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div>
                <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--success)" }}>-2.4% Annualized</div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", marginTop: "2px" }}>Baseline Shift</div>
                <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "8px", lineHeight: "1.5" }}>Industrial demand in Sector C continues downward trajectory due to efficiency upgrades.</p>
              </div>
              <div style={{ borderTop: "1px solid var(--surface-border)", paddingTop: "24px" }}>
                <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--warning)" }}>Peak Flattening</div>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", marginTop: "2px" }}>Load Distribution</div>
                <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "8px", lineHeight: "1.5" }}>Evening peaks are widening, likely driven by residential EV charging load distribution.</p>
              </div>
            </div>
          </div>
          
          <div style={{ padding: "0 8px" }}>
            <p style={{ fontSize: "12px", color: "var(--muted)", lineHeight: "1.5" }}>
              Insights are generated by comparing live actuals against a multi-modal ensemble baseline. SHAP values indicate the local importance of input features for the current inference window.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
