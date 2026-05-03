"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

export default function AnomalyAlertBar() {
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set());

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/anomalies/alerts/active`);
      if (!res.ok) return;
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch {
      setAlerts([]);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const t = setInterval(fetchAlerts, 12000);
    return () => clearInterval(t);
  }, [fetchAlerts]);

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const ack = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/api/anomalies/${id}/ack`, { method: "POST" });
      setDismissed((s) => new Set(s).add(id));
    } catch {
      setDismissed((s) => new Set(s).add(id));
    }
  };

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "var(--accent)",
        borderBottom: "1px solid var(--surface-border)",
        color: "var(--foreground)",
        padding: "12px 24px",
        fontSize: "13px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "24px",
        flexWrap: "wrap",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "var(--primary)", opacity: 0.8 }}></div>
        <span style={{ fontWeight: 600 }}>Grid Stability Warning</span>
      </div>
      <span style={{ color: "var(--muted)" }}>
        {visible.length} unacknowledged anomalies detected. Curtailment review recommended for current generation cycle.
      </span>
      
      <div style={{ display: "flex", gap: "8px" }}>
        {visible.slice(0, 2).map((a) => (
          <div
            key={a.id}
            style={{
              background: "rgba(230, 126, 34, 0.05)",
              border: "1px solid rgba(230, 126, 34, 0.1)",
              padding: "4px 12px",
              borderRadius: "4px",
              fontSize: "11px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {a.kind} · {a.timestamp_utc?.slice(11, 16) || ""}
            <button
              type="button"
              onClick={(e) => ack(a.id, e)}
              style={{
                border: "none",
                background: "none",
                color: "var(--primary)",
                padding: "0 4px",
                fontSize: "10px",
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase"
              }}
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>

      <Link
        href="/anomaly"
        style={{
          color: "var(--primary)",
          textDecoration: "none",
          fontWeight: 600,
          fontSize: "12px",
          borderLeft: "1px solid var(--surface-border)",
          paddingLeft: "24px"
        }}
      >
        Open Review Console →
      </Link>
    </div>
  );
}

