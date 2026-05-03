"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import Card from "@/components/Card";
const API_BASE = "http://localhost:8000";

export default function AnomalyPage() {
  const [points, setPoints] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [explainId, setExplainId] = useState(null);
  const [explainText, setExplainText] = useState("");
  const [explainBusy, setExplainBusy] = useState(false);
  const [rescanBusy, setRescanBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [sRes, aRes] = await Promise.all([
        fetch(`${API_BASE}/api/anomalies/series?limit=168`),
        fetch(`${API_BASE}/api/anomalies/list?limit=100`),
      ]);
      if (!sRes.ok || !aRes.ok) throw new Error("API error");
      const sData = await sRes.json();
      const aData = await aRes.json();
      setPoints(sData.points || []);
      setAnomalies(aData.anomalies || []);
    } catch (e) {
      setError("Could not load anomaly data. Is the FastAPI backend running on port 8000?");
      setPoints([]);
      setAnomalies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const stats = useMemo(() => {
    const r = points.map((p) => p.residual);
    if (!r.length) return { std: 1 };
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    const v = r.reduce((a, x) => a + (x - m) ** 2, 0) / r.length;
    return { std: Math.sqrt(v) || 1 };
  }, [points]);

  const chartSlice = useMemo(() => points.slice(-72), [points]);

  const runExplain = async (id) => {
    setExplainId(id);
    setExplainBusy(true);
    setExplainText("");
    try {
      const res = await fetch(`${API_BASE}/api/anomalies/${id}/explain`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Explain failed");
      setExplainText(data.explanation || "");
      await load();
    } catch (e) {
      setExplainText(e.message || String(e));
    } finally {
      setExplainBusy(false);
    }
  };

  const runRescan = async () => {
    setRescanBusy(true);
    try {
      await fetch(`${API_BASE}/api/anomalies/rescan-tail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tail_rows: 336, use_llm: true }),
      });
      await load();
    } finally {
      setRescanBusy(false);
    }
  };

  const ack = async (id) => {
    await fetch(`${API_BASE}/api/anomalies/${id}/ack`, { method: "POST" });
    await load();
  };

  return (
    <div>
      <header style={{ marginBottom: "40px", textAlign: "center" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.02em", marginBottom: "4px" }}>
          Anomaly Detection & Explainability
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "14px" }}>
          Ingestion runs a rolling z-score scan; LangChain + Ollama explain each event on demand.
        </p>
        <div style={{ marginTop: "16px", display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--surface-border)",
              background: "var(--surface)",
              cursor: loading ? "wait" : "pointer",
              fontWeight: 600,
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={runRescan}
            disabled={rescanBusy}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              cursor: rescanBusy ? "wait" : "pointer",
              fontWeight: 600,
            }}
          >
            {rescanBusy ? "Scanning…" : "Rescan gold data tail"}
          </button>
        </div>
        {error ? (
          <p style={{ color: "var(--danger)", marginTop: "12px", fontSize: "14px" }}>{error}</p>
        ) : null}
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "24px", marginBottom: "40px" }}>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--surface-border)",
            borderRadius: "var(--radius)",
            padding: "32px",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "32px" }}>
            Residual vs rolling baseline (last 72 hours shown)
          </h3>
          {chartSlice.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No gold_standard.csv data yet. Upload via Upload &amp; Retrain.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartSlice} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  dy={10}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    borderRadius: "8px",
                    border: "1px solid var(--surface-border)",
                  }}
                />
                <Bar dataKey="residual" name="Residual" fill="var(--warning)" barSize={4}>
                  {chartSlice.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={Math.abs(entry.residual) > stats.std * 1.5 ? "var(--danger)" : "var(--primary)"}
                    />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="mwh" name="MWh" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <Card title="Ollama + LangChain">
          <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "12px" }}>LLM explanation</h3>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "12px" }}>
            Select an anomaly below and click Explain. Uses Ollama (<code>llama3</code>) via LangChain.
          </p>
          <div
            style={{
              minHeight: "200px",
              padding: "12px",
              borderRadius: "8px",
              background: "var(--accent)",
              fontSize: "13px",
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            {explainBusy
              ? "Calling Ollama…"
              : explainText || "No explanation yet. Click Explain on a row."}
          </div>
        </Card>
      </div>

      <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>Anomaly log (local JSON)</h3>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--surface-border)",
          borderRadius: "var(--radius)",
          overflow: "auto",
        }}
      >
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", fontSize: "14px" }}>
          <thead>
            <tr style={{ background: "var(--accent)", color: "var(--muted)" }}>
              <th style={{ padding: "16px", fontWeight: "600" }}>Time (UTC)</th>
              <th style={{ padding: "16px", fontWeight: "600" }}>Kind</th>
              <th style={{ padding: "16px", fontWeight: "600" }}>z-score</th>
              <th style={{ padding: "16px", fontWeight: "600" }}>Severity</th>
              <th style={{ padding: "16px", fontWeight: "600" }}>LLM scan</th>
              <th style={{ padding: "16px", fontWeight: "600" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "24px", color: "var(--muted)" }}>
                  No anomalies logged. Upload CSV data or run &quot;Rescan gold data tail&quot;.
                </td>
              </tr>
            ) : (
              anomalies.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--surface-border)" }}>
                  <td style={{ padding: "16px", fontFamily: "var(--font-geist-mono)" }}>{a.timestamp_utc}</td>
                  <td style={{ padding: "16px" }}>{a.kind}</td>
                  <td style={{ padding: "16px", fontWeight: 600 }}>{a.z_score}</td>
                  <td style={{ padding: "16px" }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "bold",
                        background: a.severity === "high" ? "var(--danger)" : "var(--warning)",
                        color: "#fff",
                      }}
                    >
                      {a.severity}
                    </span>
                    {a.acknowledged ? (
                      <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--muted)" }}>acked</span>
                    ) : null}
                  </td>
                  <td style={{ padding: "16px", color: "var(--muted)", maxWidth: "240px" }}>
                    {a.llm_scan_note || "—"}
                  </td>
                  <td style={{ padding: "16px" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => runExplain(a.id)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          border: "none",
                          background: "var(--primary)",
                          color: "var(--primary-foreground)",
                          fontWeight: 600,
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        Explain
                      </button>
                      {!a.acknowledged ? (
                        <button
                          type="button"
                          onClick={() => ack(a.id)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "6px",
                            border: "1px solid var(--surface-border)",
                            background: "var(--surface)",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: "12px",
                          }}
                        >
                          Ack
                        </button>
                      ) : null}
                    </div>
                    {explainId === a.id && a.explanation ? (
                      <p style={{ marginTop: "8px", fontSize: "12px", color: "var(--foreground)" }}>{a.explanation}</p>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
