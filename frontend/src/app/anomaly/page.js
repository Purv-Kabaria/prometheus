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

const API_BASE = "http://localhost:8000";

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
    <div style={{ paddingBottom: "80px" }}>
      <header style={{ marginBottom: "48px" }}>
        <h1 className="serif" style={{ fontSize: "36px", fontWeight: "400", marginBottom: "8px" }}>Anomaly analysis</h1>
        <p style={{ color: "var(--muted)", fontSize: "15px" }}>Automated event detection and LLM-assisted root cause analysis</p>
        
        <div style={{ marginTop: "32px", display: "flex", gap: "12px" }}>
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "1px solid var(--surface-border)",
              background: "var(--surface)",
              cursor: loading ? "wait" : "pointer",
              fontWeight: "600",
              fontSize: "13px"
            }}
          >
            Refresh data
          </button>
          <button
            type="button"
            onClick={ackVisible}
            disabled={ackBusy || filteredAnomalies.filter((a) => !a.acknowledged).length === 0}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "1px solid var(--surface-border)",
              background: "var(--surface)",
              cursor: ackBusy ? "wait" : "pointer",
              fontWeight: "600",
              fontSize: "13px"
            }}
          >
            {ackBusy ? "Acknowledging…" : "Acknowledge visible"}
          </button>
          <button
            onClick={runRescan}
            disabled={rescanBusy}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              background: "var(--primary)",
              color: "white",
              cursor: rescanBusy ? "wait" : "pointer",
              fontWeight: "600",
              fontSize: "13px"
            }}
          >
            {rescanBusy ? "Analyzing historical data..." : "Trigger system rescan"}
          </button>
        </div>
        {error && (
          <p style={{ color: "var(--danger)", marginTop: "16px", fontSize: "13px" }}>{error}</p>
        )}
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "20px", marginBottom: "48px" }}>
        <Card title="Total anomalies" value={String(metrics.total)} subtext="Local log records" accentColor="var(--primary)" />
        <Card title="Active alerts" value={String(metrics.active)} subtext="Unacknowledged entries" accentColor={metrics.active ? "var(--warning)" : "var(--success)"} />
        <Card title="High severity" value={String(metrics.high)} subtext="Review priority" accentColor={metrics.high ? "var(--danger)" : "var(--success)"} />
        <Card title="Spike events" value={String(metrics.spike)} subtext="Positive excursions" accentColor="var(--primary)" />
        <Card title="LLM explained" value={String(metrics.explained)} subtext={`${metrics.total ? Math.round((metrics.explained / metrics.total) * 100) : 0}% coverage`} accentColor="var(--primary)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "48px", marginBottom: "48px" }}>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--surface-border)",
            borderRadius: "var(--radius)",
            padding: "32px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
            <h3 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Residual vs Rolling Baseline ({windowHours}h)
            </h3>
            <div style={{ display: "flex", gap: "8px" }}>
              {[24, 72, 168].map((h) => (
                <button
                  key={h}
                  onClick={() => setWindowHours(h)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "999px",
                    border: "1px solid var(--surface-border)",
                    background: windowHours === h ? "var(--accent)" : "var(--surface)",
                    color: windowHours === h ? "var(--primary)" : "var(--muted)",
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase"
                  }}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
          {chartSlice.length === 0 ? (
            <div style={{ padding: "60px", textAlign: "center", color: "var(--muted)" }}>
              <p style={{ fontSize: "14px" }}>No operational data detected. Ensure grid streams are active.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartSlice} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--surface-border)" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted)", fontSize: 10 }}
                  dy={10}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    borderRadius: "8px",
                    border: "1px solid var(--surface-border)",
                    fontSize: "12px"
                  }}
                />
                <Bar dataKey="residual" name="Residual" fill="var(--primary)" barSize={4}>
                  {chartSlice.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={Math.abs(entry.residual) > stats.std * 1.5 ? "var(--danger)" : "var(--primary)"}
                    />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="mwh" name="MWh" stroke="var(--primary)" strokeWidth={2} dot={false} opacity={0.3} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ background: "var(--accent)", borderRadius: "var(--radius)", padding: "24px" }}>
            <h4 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>
              Intelligence output
            </h4>
            
            <div style={{ marginBottom: "20px", display: "grid", gap: "8px" }}>
              <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase" }}>Selected Event</div>
              <div style={{ fontFamily: "monospace", fontSize: "12px", fontWeight: "600" }}>{selected?.id?.slice(0, 8) || "—"}</div>
              <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase" }}>Timestamp</div>
              <div style={{ fontSize: "12px" }}>{formatUtc(selected?.timestamp_utc)}</div>
            </div>

            <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
              <button
                onClick={runExplainSelected}
                disabled={!selected || explainBusy}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "6px",
                  border: "none",
                  background: "var(--primary)",
                  color: "white",
                  fontWeight: 700,
                  fontSize: "11px",
                  textTransform: "uppercase",
                  cursor: !selected || explainBusy ? "not-allowed" : "pointer",
                }}
              >
                {explainBusy ? "Explaining…" : "Explain"}
              </button>
              <button
                onClick={ackSelected}
                disabled={!selected || selected?.acknowledged || ackBusy}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid var(--surface-border)",
                  background: "var(--surface)",
                  fontWeight: 700,
                  fontSize: "11px",
                  textTransform: "uppercase",
                  cursor: !selected || selected?.acknowledged || ackBusy ? "not-allowed" : "pointer",
                }}
              >
                {selected?.acknowledged ? "ACK'D" : "ACK"}
              </button>
            </div>

            <div
              style={{
                minHeight: "200px",
                fontSize: "14px",
                lineHeight: "1.6",
                color: "var(--foreground)",
                overflowY: "auto",
                maxHeight: "300px"
              }}
            >
              {explainBusy ? (
                <div style={{ color: "var(--muted)", fontSize: "13px" }}>Synthesizing event data...</div>
              ) : explainText || selected?.explanation ? (
                <ReactMarkdown components={MD_COMPONENTS}>
                  {explainText || selected?.explanation}
                </ReactMarkdown>
              ) : (
                <div style={{ color: "var(--muted)", fontSize: "13px" }}>Select an event from the log to generate an LLM-powered causal explanation.</div>
              )}
            </div>

            <div style={{ marginTop: "24px", borderTop: "1px solid var(--surface-border)", paddingTop: "16px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  value={chatQuery}
                  onChange={(e) => setChatQuery(e.target.value)}
                  placeholder="Ask about this event..."
                  disabled={!selected || chatBusy}
                  onKeyDown={(e) => { if (e.key === "Enter") runChat(); }}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: "6px",
                    border: "1px solid var(--surface-border)", background: "var(--surface)",
                    color: "var(--foreground)", fontSize: "12px"
                  }}
                />
                <button
                  onClick={runChat}
                  disabled={!selected || chatBusy || !chatQuery.trim()}
                  style={{
                    padding: "8px 12px", borderRadius: "6px", border: "none",
                    background: "var(--primary)", color: "white",
                    fontWeight: 600, cursor: (!selected || chatBusy || !chatQuery.trim()) ? "not-allowed" : "pointer",
                    fontSize: "12px"
                  }}
                >
                  {chatBusy ? "..." : "Ask"}
                </button>
              </div>
              
              {chatResponse && (
                <div style={{
                  marginTop: "12px", padding: "12px", borderRadius: "8px",
                  background: "var(--surface)", fontSize: "12px", lineHeight: 1.6,
                  color: "var(--foreground)", border: "1px solid var(--surface-border)"
                }}>
                  <ReactMarkdown components={MD_COMPONENTS}>
                    {chatResponse}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <h2 className="serif" style={{ fontSize: "24px", fontWeight: "400" }}>Event log</h2>
        <span style={{ background: "var(--accent)", color: "var(--primary)", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "10px" }}>
          SYSTEM RECORD
        </span>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "16px", marginBottom: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 180px 180px 180px 180px", gap: "12px" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search anomalies..."
            style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--surface-border)", background: "var(--surface)", color: "var(--foreground)", fontSize: "13px" }}
          />
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--surface-border)", background: "var(--surface)", color: "var(--foreground)", fontSize: "13px" }}>
            <option value="all">All severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--surface-border)", background: "var(--surface)", color: "var(--foreground)", fontSize: "13px" }}>
            <option value="all">All kinds</option>
            <option value="spike">Spike</option>
            <option value="dip">Dip</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--surface-border)", background: "var(--surface)", color: "var(--foreground)", fontSize: "13px" }}>
            {sortOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={onlyUnacked} onChange={(e) => setOnlyUnacked(e.target.checked)} />
            Unacknowledged only
          </label>
        </div>
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--surface-border)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--surface-border)", background: "var(--accent)" }}>
              <th style={{ padding: "16px 24px", fontWeight: "600", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Timestamp</th>
              <th style={{ padding: "16px 24px", fontWeight: "600", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</th>
              <th style={{ padding: "16px 24px", fontWeight: "600", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>z-score</th>
              <th style={{ padding: "16px 24px", fontWeight: "600", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Severity</th>
              <th style={{ padding: "16px 24px", fontWeight: "600", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAnomalies.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "48px", textAlign: "center", color: "var(--muted)" }}>
                  No significant anomalies detected in the current window.
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
                    borderBottom: "1px solid var(--surface-border)", 
                    background: currentSelectedId === a.id ? "var(--accent)" : "transparent",
                    cursor: "pointer",
                    transition: "background 0.2s"
                  }}
                >
                  <td style={{ padding: "16px 24px", color: "var(--muted)" }}>{formatUtc(a.timestamp_utc)}</td>
                  <td style={{ padding: "16px 24px", fontWeight: "500" }}>{a.kind}</td>
                  <td style={{ padding: "16px 24px", fontWeight: "600" }}>{a.z_score}</td>
                  <td style={{ padding: "16px 24px" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "10px",
                        fontWeight: "700",
                        textTransform: "uppercase",
                        background: severityColors[a.severity] || "var(--muted)",
                        color: "#fff",
                      }}
                    >
                      {a.severity}
                    </span>
                  </td>
                  <td style={{ padding: "16px 24px" }}>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); runExplain(a.id); }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--primary)",
                          fontWeight: "700",
                          cursor: "pointer",
                          fontSize: "11px",
                          textTransform: "uppercase",
                          padding: "0"
                        }}
                      >
                        Explain
                      </button>
                      {!a.acknowledged && (
                        <button
                          onClick={(e) => { e.stopPropagation(); ack(a.id); }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--muted)",
                            fontWeight: "700",
                            cursor: "pointer",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            padding: "0"
                          }}
                        >
                          Acknowledge
                        </button>
                      )}
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
