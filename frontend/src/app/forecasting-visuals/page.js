"use client";

import { useEffect, useState } from "react";

const plots = [
  { id: "viz-01", file: "/forecasting-models/viz_01.png", title: "Before Outlier Treatment: Consumption Distribution", section: "Data Validation" },
  { id: "viz-02", file: "/forecasting-models/viz_02.png", title: "After Outlier Treatment (Winsorized): Consumption Distribution", section: "Data Validation" },
  { id: "viz-03", file: "/forecasting-models/viz_03.png", title: "Time Series Decomposition (2-Week Slice)", section: "Data Validation" },
  { id: "viz-04", file: "/forecasting-models/viz_04.png", title: "Autocorrelation / Partial Autocorrelation", section: "Data Validation" },
  { id: "viz-05", file: "/forecasting-models/viz_05.png", title: "Feature Correlation Heatmap", section: "Feature Engineering" },
  { id: "viz-06", file: "/forecasting-models/viz_06.png", title: "Daily Average Consumption", section: "Feature Engineering" },
  { id: "viz-07", file: "/forecasting-models/viz_07.png", title: "Periodogram: Mathematical Proof of Seasonality", section: "Feature Engineering" },
  { id: "viz-08", file: "/forecasting-models/viz_08.png", title: "Target vs Lag-1 Relationship", section: "Feature Engineering" },
  { id: "viz-09", file: "/forecasting-models/viz_09.png", title: "Off-Peak vs Business Hours Distribution", section: "Feature Engineering" },
  { id: "viz-10", file: "/forecasting-models/viz_10.png", title: "Monthly Distribution Shifts", section: "Feature Engineering" },
  { id: "viz-11", file: "/forecasting-models/viz_11.png", title: "Feature Importance (Gain)", section: "Model Explainability" },
  { id: "viz-12", file: "/forecasting-models/viz_12.png", title: "Ultimate Model: 24-Hour Recursive Forecast", section: "Forecast Output" },
  { id: "viz-13", file: "/forecasting-models/viz_13.png", title: "1-Month Ahead Forecast (Prophet)", section: "Forecast Output" },
  { id: "viz-14", file: "/forecasting-models/viz_14.png", title: "1-Month Ahead Forecast (Prophet) - Variant", section: "Forecast Output" },
  { id: "viz-15", file: "/forecasting-models/viz_15.png", title: "Cross-Validation Technique Comparison", section: "Model Selection" },
  { id: "viz-16", file: "/forecasting-models/viz_16.png", title: "MAPE / RMSE / Train Time Comparison", section: "Model Selection" },
  { id: "viz-17", file: "/forecasting-models/viz_17.png", title: "Forecast Degradation Over Horizon", section: "Model Selection" },
  { id: "viz-18", file: "/forecasting-models/viz_18.png", title: "SHAP Summary Plot: Feature Impact", section: "Model Explainability" },
  { id: "viz-19", file: "/forecasting-models/viz_19.png", title: "SHAP Dependence / Local Pattern", section: "Model Explainability" },
  { id: "viz-20", file: "/forecasting-models/viz_20.png", title: "SHAP Waterfall (Single Prediction)", section: "Model Explainability" },
  { id: "viz-21", file: "/forecasting-models/viz_21.png", title: "SHAP Variant (Notebook Output)", section: "Model Explainability" },
  { id: "viz-22", file: "/forecasting-models/viz_22.png", title: "XGBoost: 2-Week Holdout Forecast", section: "Base Model Performance" },
  { id: "viz-23", file: "/forecasting-models/viz_23.png", title: "CatBoost: 2-Week Holdout Forecast", section: "Base Model Performance" },
  { id: "viz-24", file: "/forecasting-models/viz_24.png", title: "LightGBM: 2-Week Holdout Forecast", section: "Base Model Performance" },
  { id: "viz-25", file: "/forecasting-models/viz_25.png", title: "Prophet: 2-Week Holdout Forecast", section: "Base Model Performance" },
  { id: "viz-26", file: "/forecasting-models/viz_26.png", title: "Model Comparison - MAPE / RMSE / Time", section: "Base Model Performance" },
  { id: "viz-27", file: "/forecasting-models/viz_27.png", title: "Model Comparison - Recomputed Variant", section: "Base Model Performance" },
  { id: "viz-28", file: "/forecasting-models/viz_28.png", title: "Short-Term vs Long-Term Degradation", section: "Model Selection" },
  { id: "viz-29", file: "/forecasting-models/viz_29.png", title: "SHAP Summary Plot (Best Model)", section: "Model Explainability" },
  { id: "viz-30", file: "/forecasting-models/viz_30.png", title: "SHAP Waterfall (Best Model)", section: "Model Explainability" },
  { id: "viz-31", file: "/forecasting-models/viz_31.png", title: "LightGBM Learning Curve", section: "Training Diagnostics" },
  { id: "viz-32", file: "/forecasting-models/viz_32.png", title: "Final Model Tournament: Base vs Ensemble", section: "Ensemble Validation" },
  { id: "viz-33", file: "/forecasting-models/viz_33.png", title: "3-Day High-Fidelity Forecast Comparison", section: "Ensemble Validation" },
  { id: "viz-34", file: "/forecasting-models/viz_34.png", title: "Spike Diagnostics: 96-Hour Peak Window", section: "Stress Testing" },
  { id: "viz-35", file: "/forecasting-models/viz_35.png", title: "Macro Grid Analysis: COVID Demand Shock", section: "Stress Testing" },
  { id: "viz-36", file: "/forecasting-models/viz_36.png", title: "Spike Diagnostics After Sample Weighting", section: "Stress Testing" },
];

const sections = [...new Set(plots.map((p) => p.section))];

function PlotItem({ plot, index }) {
  return (
    <details
      id={plot.id}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--surface-border)",
        borderRadius: "10px",
        padding: "10px 12px",
      }}
    >
      <summary style={{ cursor: "pointer", fontSize: "14px", fontWeight: 600, color: "var(--foreground)" }}>
        {index}. {plot.title}
      </summary>
      <div style={{ marginTop: "10px", border: "1px solid var(--surface-border)", borderRadius: "8px", overflow: "hidden" }}>
        <img src={plot.file} alt={plot.title} style={{ width: "100%", display: "block", background: "var(--background)" }} />
      </div>
    </details>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "10px", padding: "12px" }}>
      <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "6px" }}>{label}</p>
      <p style={{ fontSize: "14px", fontWeight: 700 }}>{value}</p>
    </div>
  );
}

export default function ForecastingVisualsPage() {
  const [summary, setSummary] = useState(null);
  const [prePlots, setPrePlots] = useState([]);

  useEffect(() => {
    fetch("/notebook/preprocess/summary.json").then((r) => r.json()).then(setSummary).catch(() => {});
    fetch("/notebook/preprocess/meta.json").then((r) => r.json()).then(setPrePlots).catch(() => {});
  }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "28px", alignItems: "start" }}>
      <div>
        <header style={{ marginBottom: "22px" }}>
          <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
            Notebook Interface View
          </p>
          <h1 className="serif" style={{ fontSize: "34px", fontWeight: 400, marginBottom: "8px" }}>
            Forecasting Visualizations (Collapsible)
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "14px", lineHeight: 1.6 }}>
            Preprocess results first, followed by the complete forecasting visual catalog.
          </p>
        </header>

        <section style={{ marginBottom: "18px", background: "var(--accent)", border: "1px solid var(--surface-border)", borderRadius: "10px", padding: "14px" }}>
          <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
            Preprocess Section
          </p>
          <h2 className="serif" style={{ fontSize: "24px", fontWeight: 400, marginBottom: "10px" }}>
            preprocess.ipynb Results
          </h2>

          {summary && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px", marginBottom: "10px" }}>
                <StatCard label="Data Shape" value={`${summary.shape?.[0] ?? "-"} rows x ${summary.shape?.[1] ?? "-"} cols`} />
                <StatCard label="Date Range" value={`${summary.date_min ?? "-"} to ${summary.date_max ?? "-"}`} />
              </div>

              <details open style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "8px", padding: "10px", marginBottom: "10px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>Derived Columns</summary>
                <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {(summary.columns || []).map((c) => (
                    <span key={c} style={{ fontSize: "12px", border: "1px solid var(--surface-border)", borderRadius: "999px", padding: "4px 10px", background: "var(--accent)" }}>{c}</span>
                  ))}
                </div>
              </details>

              <details open style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "8px", padding: "10px", marginBottom: "10px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>Missing Values</summary>
                <div style={{ marginTop: "8px", display: "grid", gap: "6px" }}>
                  {Object.entries(summary.missing_values || {}).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--surface-border)", paddingBottom: "4px", fontSize: "12px" }}>
                      <span>{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}

          <div style={{ display: "grid", gap: "10px" }}>
            {prePlots.map((plot, idx) => (
              <details key={plot.id} open={idx === 0} style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "10px", padding: "10px 12px" }}>
                <summary style={{ cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>{idx + 1}. {plot.title}</summary>
                <div style={{ marginTop: "10px", border: "1px solid var(--surface-border)", borderRadius: "8px", overflow: "hidden" }}>
                  <img src={plot.file} alt={plot.title} style={{ width: "100%", display: "block", background: "var(--background)" }} />
                </div>
              </details>
            ))}
          </div>
        </section>

        {sections.map((section) => {
          const sectionPlots = plots.filter((p) => p.section === section);
          return (
            <details
              key={section}
              open={section === "Data Validation"}
              style={{
                marginBottom: "14px",
                background: "var(--accent)",
                border: "1px solid var(--surface-border)",
                borderRadius: "10px",
                padding: "12px",
              }}
            >
              <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "15px", color: "var(--foreground)" }}>
                {section} ({sectionPlots.length})
              </summary>
              <div style={{ marginTop: "10px", display: "grid", gap: "10px" }}>
                {sectionPlots.map((plot, idx) => (
                  <PlotItem key={plot.id} plot={plot} index={idx + 1} />
                ))}
              </div>
            </details>
          );
        })}
      </div>

      <aside style={{ position: "sticky", top: "100px" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "10px", padding: "14px" }}>
          <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>
            Full Plot Map
          </p>
          <div style={{ display: "grid", gap: "10px", maxHeight: "72vh", overflow: "auto", paddingRight: "2px" }}>
            <div>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "6px" }}>Preprocess</p>
              <div style={{ display: "grid", gap: "4px" }}>
                {prePlots.map((plot) => (
                  <a
                    key={plot.id}
                    href={plot.file}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: "12px",
                      lineHeight: 1.35,
                      color: "var(--foreground)",
                      textDecoration: "none",
                      padding: "6px 8px",
                      borderRadius: "7px",
                      border: "1px solid var(--surface-border)",
                      background: "var(--accent)",
                    }}
                  >
                    {plot.id.toUpperCase()} - {plot.title}
                  </a>
                ))}
              </div>
            </div>

            {sections.map((section) => {
              const sectionPlots = plots.filter((p) => p.section === section);
              return (
                <div key={section}>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "6px" }}>{section}</p>
                  <div style={{ display: "grid", gap: "4px" }}>
                    {sectionPlots.map((plot) => (
                      <a
                        key={plot.id}
                        href={`#${plot.id}`}
                        style={{
                          fontSize: "12px",
                          lineHeight: 1.35,
                          color: "var(--foreground)",
                          textDecoration: "none",
                          padding: "6px 8px",
                          borderRadius: "7px",
                          border: "1px solid var(--surface-border)",
                          background: "var(--accent)",
                        }}
                      >
                        {plot.id.toUpperCase()} - {plot.title}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}
