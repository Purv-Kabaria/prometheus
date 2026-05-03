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
        background: "linear-gradient(90deg, #7f1d1d 0%, #b91c1c 50%, #991b1b 100%)",
        color: "#fff",
        padding: "10px 20px",
        fontSize: "14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        flexWrap: "wrap",
        boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      }}
    >
      <span style={{ fontWeight: 700 }}>Demand spike alert</span>
      <span style={{ opacity: 0.95 }}>
        {visible.length} unacknowledged anomaly{visible.length === 1 ? "" : "ies"} (
        {visible.filter((x) => x.severity === "high").length} high severity)
      </span>
      <Link
        href="/anomaly"
        style={{
          color: "#fecaca",
          textDecoration: "underline",
          fontWeight: 600,
        }}
      >
        Open anomaly console
      </Link>
      {visible.slice(0, 3).map((a) => (
        <span
          key={a.id}
          style={{
            background: "rgba(0,0,0,0.2)",
            padding: "4px 10px",
            borderRadius: "8px",
            fontSize: "12px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {a.kind} z={a.z_score} @ {a.timestamp_utc?.slice(5, 16) || ""}
          <button
            type="button"
            onClick={(e) => ack(a.id, e)}
            style={{
              border: "none",
              background: "#fff",
              color: "#991b1b",
              borderRadius: "6px",
              padding: "2px 8px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Ack
          </button>
        </span>
      ))}
    </div>
  );
}
