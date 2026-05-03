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
import ReactMarkdown from "react-markdown";
import Card from "@/components/Card";
import { API_BASE } from "@/lib/api";

const severityColors = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--success)",
};

const MD_COMPONENTS = {
  p: ({node, ...props}) => <p style={{ marginBottom: '10px' }} {...props} />,
  ul: ({node, ...props}) => <ul style={{ marginLeft: '22px', marginBottom: '12px', listStyleType: 'disc' }} {...props} />,
  ol: ({node, ...props}) => <ol style={{ marginLeft: '22px', marginBottom: '12px', listStyleType: 'decimal' }} {...props} />,
  li: ({node, ...props}) => <li style={{ marginBottom: '6px' }} {...props} />,
  h1: ({node, ...props}) => <h1 style={{ fontWeight: '800', fontSize: '20px', margin: '16px 0 10px 0' }} {...props} />,
  h2: ({node, ...props}) => <h2 style={{ fontWeight: '700', fontSize: '18px', margin: '14px 0 8px 0' }} {...props} />,
  h3: ({node, ...props}) => <h3 style={{ fontWeight: '600', fontSize: '16px', margin: '12px 0 6px 0' }} {...props} />,
  strong: ({node, ...props}) => <strong style={{ fontWeight: 'bold' }} {...props} />
};

const sortOptions = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "severity", label: "Severity first" },
  { id: "zscore", label: "Highest z-score first" },
];

function formatUtc(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function severityRank(s) {
  if (s === "high") return 3;
  if (s === "medium") return 2;
  return 1;
}

export default function AnomalyPage() {
  const [points, setPoints] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [explainId, setExplainId] = useState(null);
  const [explainText, setExplainText] = useState("");
  const [explainBusy, setExplainBusy] = useState(false);
  const [chatQuery, setChatQuery] = useState("");
  const [chatResponse, setChatResponse] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [rescanBusy, setRescanBusy] = useState(false);
  const [ackBusy, setAckBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [onlyUnacked, setOnlyUnacked] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [windowHours, setWindowHours] = useState(72);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [sRes, aRes] = await Promise.all([
        fetch(`${API_BASE}/api/anomalies/series?limit=168`),
        fetch(`${API_BASE}/api/anomalies/list?limit=300`),
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
    const firstTick = setTimeout(load, 0);
    const t = setInterval(load, 20000);
    return () => {
      clearTimeout(firstTick);
      clearInterval(t);
    };
  }, [load]);

  const stats = useMemo(() => {
    const r = points.map((p) => p.residual);
    if (!r.length) return { std: 1 };
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    const v = r.reduce((a, x) => a + (x - m) ** 2, 0) / r.length;
    return { std: Math.sqrt(v) || 1 };
  }, [points]);

  const chartSlice = useMemo(() => points.slice(-windowHours), [points, windowHours]);

  const filteredAnomalies = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = [...anomalies];
    if (severityFilter !== "all") out = out.filter((a) => a.severity === severityFilter);
    if (kindFilter !== "all") out = out.filter((a) => a.kind === kindFilter);
    if (onlyUnacked) out = out.filter((a) => !a.acknowledged);
    if (q) {
      out = out.filter((a) =>
        [
          a.id,
          a.timestamp_utc,
          a.kind,
          a.severity,
          a.llm_scan_note,
          a.upload_filename,
          a.explanation,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (sortBy === "newest") out.sort((a, b) => new Date(b.timestamp_utc) - new Date(a.timestamp_utc));
    if (sortBy === "oldest") out.sort((a, b) => new Date(a.timestamp_utc) - new Date(b.timestamp_utc));
    if (sortBy === "severity") {
      out.sort(
        (a, b) =>
          severityRank(b.severity) - severityRank(a.severity) ||
          Math.abs(Number(b.z_score || 0)) - Math.abs(Number(a.z_score || 0))
      );
    }
    if (sortBy === "zscore") {
      out.sort((a, b) => Math.abs(Number(b.z_score || 0)) - Math.abs(Number(a.z_score || 0)));
    }
    return out;
  }, [anomalies, search, severityFilter, kindFilter, onlyUnacked, sortBy]);

  const currentSelectedId = useMemo(() => {
    if (selectedId && filteredAnomalies.some((a) => a.id === selectedId)) return selectedId;
    return filteredAnomalies[0]?.id || null;
  }, [selectedId, filteredAnomalies]);

  const selected = useMemo(
    () => anomalies.find((a) => a.id === currentSelectedId) || null,
    [anomalies, currentSelectedId]
  );

  const metrics = useMemo(() => {
    const total = anomalies.length;
    const active = anomalies.filter((a) => !a.acknowledged).length;
    const high = anomalies.filter((a) => a.severity === "high").length;
    const spike = anomalies.filter((a) => a.kind === "spike").length;
    const explained = anomalies.filter((a) => a.explanation).length;
    return { total, active, high, spike, explained };
  }, [anomalies]);

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

  const runExplainSelected = () => {
    if (!currentSelectedId) return;
    runExplain(currentSelectedId);
  };

  const runChat = async () => {
    if (!currentSelectedId || !chatQuery.trim()) return;
    setChatBusy(true);
    setChatResponse("");
    try {
      const res = await fetch(`${API_BASE}/api/anomalies/${currentSelectedId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: chatQuery }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Chat failed");
      setChatResponse(data.response || "");
    } catch (e) {
      setChatResponse(`**Error:** ${e.message || String(e)}`);
    } finally {
      setChatBusy(false);
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
    setAckBusy(true);
    await fetch(`${API_BASE}/api/anomalies/${id}/ack`, { method: "POST" });
    await load();
    setAckBusy(false);
  };

  const ackSelected = () => {
    if (!currentSelectedId) return;
    ack(currentSelectedId);
  };

  const ackVisible = async () => {
    const targets = filteredAnomalies.filter((a) => !a.acknowledged).slice(0, 30);
    if (!targets.length) return;
    setAckBusy(true);
    await Promise.all(
      targets.map((a) =>
        fetch(`${API_BASE}/api/anomalies/${a.id}/ack`, { method: "POST" })
      )
    );
    await load();
    setAckBusy(false);
  };

  return (
    <div>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "30px", fontWeight: "800", letterSpacing: "-0.02em", marginBottom: "6px" }}>
          Anomaly Detection & Explainability
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "14px" }}>
          Live triage console for ingestion anomalies, LLM root-cause interpretation, and operator acknowledgment.
        </p>
        <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
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
            onClick={ackVisible}
            disabled={ackBusy || filteredAnomalies.filter((a) => !a.acknowledged).length === 0}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--surface-border)",
              background: "var(--surface)",
              cursor: ackBusy ? "wait" : "pointer",
              fontWeight: 600,
            }}
          >
            {ackBusy ? "Acknowledging…" : "Acknowledge visible"}
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <Card title="Total anomalies" value={String(metrics.total)} subtext="Local log records" />
        <Card title="Active alerts" value={String(metrics.active)} subtext="Unacknowledged entries" type={metrics.active ? "warning" : "success"} />
        <Card title="High severity" value={String(metrics.high)} subtext="Immediate review priority" type={metrics.high ? "danger" : "success"} />
        <Card title="Spike events" value={String(metrics.spike)} subtext="Positive excursions" />
        <Card title="LLM explained" value={String(metrics.explained)} subtext={`${metrics.total ? Math.round((metrics.explained / metrics.total) * 100) : 0}% coverage`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "24px", marginBottom: "24px" }}>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--surface-border)",
            borderRadius: "var(--radius)",
            padding: "24px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700" }}>Residual monitor</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              {[24, 72, 168].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setWindowHours(h)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "999px",
                    border: "1px solid var(--surface-border)",
                    background: windowHours === h ? "var(--accent)" : "var(--surface)",
                    color: windowHours === h ? "var(--primary)" : "var(--muted)",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
          {chartSlice.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>No gold_standard.csv data yet. Upload via Upload &amp; Retrain.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
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
          <h3 style={{ fontSize: "16px", fontWeight: "700", marginBottom: "12px" }}>Selected anomaly</h3>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "12px" }}>
            Pick an event below. Explain calls your configured Ollama model through LangChain.
          </p>
          <div style={{ marginBottom: "12px", display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", color: "var(--muted)" }}>ID</div>
            <div style={{ fontFamily: "var(--font-geist-mono)", fontSize: "12px" }}>{selected?.id || "—"}</div>
            <div style={{ fontSize: "12px", color: "var(--muted)" }}>Timestamp (UTC)</div>
            <div style={{ fontSize: "13px" }}>{formatUtc(selected?.timestamp_utc)}</div>
            <div style={{ fontSize: "12px", color: "var(--muted)" }}>Telemetry</div>
            <div style={{ fontSize: "13px" }}>
              {selected ? `${selected.kind} | z=${selected.z_score} | Δ ${selected.delta_mwh} MWh` : "—"}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <button
              type="button"
              onClick={runExplainSelected}
              disabled={!selected || explainBusy}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "none",
                background: "var(--primary)",
                color: "var(--primary-foreground)",
                fontWeight: 700,
                fontSize: "12px",
                cursor: !selected || explainBusy ? "not-allowed" : "pointer",
              }}
            >
              {explainBusy ? "Explaining…" : "Explain selected"}
            </button>
            <button
              type="button"
              onClick={ackSelected}
              disabled={!selected || selected?.acknowledged || ackBusy}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--surface-border)",
                background: "var(--surface)",
                fontWeight: 700,
                fontSize: "12px",
                cursor: !selected || selected?.acknowledged || ackBusy ? "not-allowed" : "pointer",
              }}
            >
              {selected?.acknowledged ? "Acknowledged" : ackBusy ? "Acknowledging…" : "Acknowledge"}
            </button>
          </div>
          <div
            style={{
              minHeight: "200px",
              padding: "16px",
              borderRadius: "8px",
              background: "var(--accent)",
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            {explainBusy ? (
              "Calling Ollama…"
            ) : explainText || selected?.explanation ? (
              <ReactMarkdown components={MD_COMPONENTS}>
                {explainText || selected?.explanation}
              </ReactMarkdown>
            ) : (
              "No explanation yet. Select anomaly and click Explain."
            )}
          </div>
          <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--muted)", lineHeight: 1.5 }}>
            Scan note: {selected?.llm_scan_note || "Not generated yet"}
          </div>

          <div style={{ marginTop: "20px", borderTop: "1px solid var(--surface-border)", paddingTop: "16px" }}>
            <h4 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>Ask about this anomaly</h4>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={chatQuery}
                onChange={(e) => setChatQuery(e.target.value)}
                placeholder="E.g., What are the possible reasons for this spike?"
                disabled={!selected || chatBusy}
                onKeyDown={(e) => { if (e.key === "Enter") runChat(); }}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: "6px",
                  border: "1px solid var(--surface-border)", background: "var(--background)",
                  color: "var(--foreground)", fontSize: "13px"
                }}
              />
              <button
                onClick={runChat}
                disabled={!selected || chatBusy || !chatQuery.trim()}
                style={{
                  padding: "8px 16px", borderRadius: "6px", border: "none",
                  background: "var(--primary)", color: "var(--primary-foreground)",
                  fontWeight: 600, cursor: (!selected || chatBusy || !chatQuery.trim()) ? "not-allowed" : "pointer",
                  fontSize: "13px"
                }}
              >
                {chatBusy ? "Asking…" : "Ask"}
              </button>
            </div>
            
            {chatResponse && (
              <div style={{
                marginTop: "12px", padding: "12px", borderRadius: "8px",
                background: "var(--accent)", fontSize: "13px", lineHeight: 1.6,
                color: "var(--foreground)"
              }}>
                <ReactMarkdown components={MD_COMPONENTS}>
                  {chatResponse}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "14px", marginBottom: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.7fr 0.7fr 0.7fr 0.8fr", gap: "10px" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by id, timestamp, note, filename..."
            style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--surface-border)", background: "var(--background)", color: "var(--foreground)" }}
          />
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--surface-border)", background: "var(--background)", color: "var(--foreground)" }}>
            <option value="all">All severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--surface-border)", background: "var(--background)", color: "var(--foreground)" }}>
            <option value="all">All kinds</option>
            <option value="spike">Spike</option>
            <option value="dip">Dip</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--surface-border)", background: "var(--background)", color: "var(--foreground)" }}>
            {sortOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--muted)" }}>
            <input type="checkbox" checked={onlyUnacked} onChange={(e) => setOnlyUnacked(e.target.checked)} />
            Unacknowledged only
          </label>
        </div>
      </div>

      <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "10px" }}>
        Anomaly log ({filteredAnomalies.length} shown)
      </h3>
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
              <th style={{ padding: "14px 16px", fontWeight: "600" }}>Time (UTC)</th>
              <th style={{ padding: "14px 16px", fontWeight: "600" }}>Signal</th>
              <th style={{ padding: "14px 16px", fontWeight: "600" }}>Severity</th>
              <th style={{ padding: "14px 16px", fontWeight: "600" }}>LLM scan note</th>
              <th style={{ padding: "14px 16px", fontWeight: "600" }}>State</th>
              <th style={{ padding: "14px 16px", fontWeight: "600" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAnomalies.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "24px", color: "var(--muted)" }}>
                  No matching anomalies. Adjust filters or run &quot;Rescan gold data tail&quot;.
                </td>
              </tr>
            ) : (
              filteredAnomalies.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => {
                    setSelectedId(a.id);
                    setChatResponse("");
                    setChatQuery("");
                  }}
                  style={{
                    borderTop: "1px solid var(--surface-border)",
                    background: currentSelectedId === a.id ? "var(--accent)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <td style={{ padding: "14px 16px", fontFamily: "var(--font-geist-mono)", fontSize: "12px" }}>
                    {formatUtc(a.timestamp_utc)}
                  </td>
                  <td style={{ padding: "14px 16px", fontWeight: 600 }}>
                    {a.kind} | z={a.z_score} | Δ {a.delta_mwh}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "bold",
                        background: severityColors[a.severity] || "var(--muted)",
                        color: "#fff",
                      }}
                    >
                      {a.severity}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--muted)", maxWidth: "340px" }}>
                    {a.llm_scan_note || "—"}
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: "12px", color: "var(--muted)" }}>
                    {a.acknowledged ? "Acknowledged" : "Active"}
                    {a.upload_filename ? ` • ${a.upload_filename}` : ""}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          runExplain(a.id);
                        }}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            ack(a.id);
                          }}
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
