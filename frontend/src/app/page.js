"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Card from '../components/Card';
import ProposalCard from '../components/agent/ProposalCard';
import FeedbackModal from '../components/agent/FeedbackModal';

const API_BASE = 'http://localhost:8000/api/agent';

export default function GridOfficerDashboard() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalState, setModalState] = useState({ isOpen: false, proposal: null, mode: null });
  const [userPrompt, setUserPrompt] = useState('');
  const [agentResponse, setAgentResponse] = useState(null);
  const [telemetry, setTelemetry] = useState({ demand: null, generation: null });

  const fetchProposals = async () => {
    try {
      const res = await fetch(`${API_BASE}/proposals`);
      const data = await res.json();
      setProposals(data.proposals || []);
    } catch (err) {
      console.error("Failed to fetch proposals.", err);
    }
  };

  const fetchTelemetry = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/forecast/24h');
      const data = await res.json();
      const currentHour = new Date().getHours();
      const currentSlot = data.slots?.[currentHour];
      const peakMw = data.summary?.peak_mw;
      if (currentSlot) {
        setTelemetry({
          demand: currentSlot.p50,
          generation: peakMw ? Math.round(peakMw * 1.10) : null
        });
      }
    } catch (err) { /* silently fail */ }
  };

  useEffect(() => {
    fetchProposals();
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  const triggerAgent = async () => {
    setLoading(true);
    setAgentResponse(null);
    try {
      const body = userPrompt.trim() ? { prompt: userPrompt.trim() } : {};
      const res = await fetch(`${API_BASE}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.details?.final_response) {
        setAgentResponse(data.details.final_response);
      }
      await fetchProposals();
    } catch (err) {
      console.error("Failed to trigger agent:", err);
    }
    setLoading(false);
  };

  const handleAccept = async (proposal) => {
    try {
      await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposal.id, status: 'accepted' })
      });
      await fetchProposals();
    } catch (err) {
      console.error("Failed to accept proposal:", err);
    }
  };

  const handleModalSubmit = async (feedbackData) => {
    try {
      await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackData)
      });
      setModalState({ isOpen: false, proposal: null, mode: null });
      await fetchProposals();
    } catch (err) {
      console.error("Failed to submit feedback:", err);
    }
  };

  return (
    <div style={{ paddingBottom: "80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "48px" }}>
        <div>
          <h1 className="serif" style={{ fontSize: "36px", fontWeight: "400", marginBottom: "8px" }}>Grid Control</h1>
          <p style={{ color: "var(--muted)", fontSize: "15px" }}>Real-time operational intelligence and control center</p>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <button 
            onClick={triggerAgent}
            disabled={loading}
            style={{ 
              background: "var(--primary)", 
              color: "white", 
              padding: "10px 24px", 
              borderRadius: "8px", 
              fontSize: "14px", 
              fontWeight: "600",
              opacity: loading ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            {loading && <div style={{ width: "12px", height: "12px", border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>}
            {loading ? 'Analyzing...' : 'Run Agent Scan'}
          </button>
        </div>
      </header>

      {/* Institutional Prompt Input */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "8px", display: "flex", gap: "8px", marginBottom: "32px", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
        <input
          type="text"
          value={userPrompt}
          onChange={e => setUserPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && triggerAgent()}
          placeholder="Inquire with Prometheus AI... (e.g., 'Analyze curtailment risks' or leave blank for general scan)"
          style={{ flex: 1, border: "none", background: "transparent", padding: "12px 16px", outline: "none", fontSize: "14px", color: "var(--foreground)" }}
        />
        <button 
          onClick={triggerAgent} 
          disabled={loading}
          style={{ background: "var(--accent)", color: "var(--primary)", padding: "0 24px", borderRadius: "6px", fontSize: "13px", fontWeight: "700" }}
        >
          {loading ? '...' : 'SEND'}
        </button>
      </div>

      {/* Agent Response Panel */}
      {agentResponse && (
        <div style={{ background: "var(--accent)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "24px", marginBottom: "48px" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            <span style={{ fontSize: "20px" }}>🤖</span>
            <div>
              <p style={{ fontSize: "10px", fontWeight: "700", color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Prometheus Intelligence Report</p>
              <p style={{ fontSize: "14px", color: "var(--foreground)", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{agentResponse}</p>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginBottom: "48px" }}>
        <Card title="Current Generation" value={telemetry.generation ? `${telemetry.generation.toLocaleString()} MW` : "5,000 MW"} subtext="84% capacity utilization" accentColor="var(--primary)" />
        <Card title="System Demand" value={telemetry.demand ? `${telemetry.demand.toLocaleString()} MW` : "4,200 MW"} subtext="Nominal operating range" accentColor="var(--success)" />
        <Card title="Forecast Accuracy" value="98.4%" subtext="Last 24h rolling average" accentColor="var(--primary)" />
      </div>

      <main style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "48px", alignItems: "start" }}>
        
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
            <h2 className="serif" style={{ fontSize: "24px", fontWeight: "400" }}>Strategic Proposals</h2>
            <span style={{ background: "var(--accent)", color: "var(--primary)", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "10px" }}>
              {proposals.length} ACTIVE
            </span>
          </div>
          
          {proposals.length === 0 ? (
            <div style={{ 
              background: "var(--surface)", 
              border: "1px solid var(--surface-border)", 
              borderRadius: "var(--radius)", 
              padding: "60px", 
              textAlign: "center" 
            }}>
              <p style={{ color: "var(--muted)", fontSize: "14px" }}>Grid status is nominal. No active intervention required.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {proposals.map(prop => (
                <ProposalCard 
                  key={prop.id}
                  proposal={prop}
                  onAccept={handleAccept}
                  onReject={() => setModalState({ isOpen: true, proposal: prop, mode: 'reject' })}
                  onOverride={() => setModalState({ isOpen: true, proposal: prop, mode: 'override' })}
                />
              ))}
            </div>
          )}
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "24px" }}>
            <h4 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px" }}>
              System Health & Telemetry
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {[
                { label: "Committed Generation", value: telemetry.generation ? `${telemetry.generation.toLocaleString()} MW` : "—", status: "Nominal" },
                { label: "Forecast Demand", value: telemetry.demand ? `${telemetry.demand.toLocaleString()} MW` : "—", status: "Nominal", warning: telemetry.demand > 12000 },
                { label: "Frequency", value: "49.99 Hz", status: "Nominal" },
                { label: "Reserve Margin", value: "18.5%", status: "Optimal" }
              ].map(stat => (
                <div key={stat.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>{stat.label}</span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: stat.warning ? "var(--danger)" : "var(--foreground)" }}>{stat.value}</div>
                    <div style={{ fontSize: "9px", color: stat.warning ? "var(--danger)" : "var(--success)", fontWeight: "700", textTransform: "uppercase" }}>{stat.status}</div>
                  </div>
                </div>
              ))}
            </div>

            {telemetry.generation && telemetry.demand && telemetry.generation > telemetry.demand * 1.15 && (
              <div style={{ marginTop: "24px", padding: "12px", background: "var(--accent)", borderRadius: "8px", border: "1px solid var(--surface-border)" }}>
                <p style={{ fontSize: "10px", color: "var(--warning)", lineHeight: "1.4", margin: 0 }}>
                  <span style={{ fontWeight: "700" }}>Over-generation Alert:</span> Committed generation exceeds forecast demand by &gt;15%. Review curtailment proposals.
                </p>
              </div>
            )}
          </div>

          <div style={{ background: "var(--accent)", borderRadius: "var(--radius)", padding: "24px" }}>
            <h4 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>
              Quick Links
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link href="/forecasting" style={{ fontSize: "13px", color: "var(--foreground)", textDecoration: "none", fontWeight: "500" }}>→ Demand Forecasting</Link>
              <Link href="/reporting" style={{ fontSize: "13px", color: "var(--foreground)", textDecoration: "none", fontWeight: "500" }}>→ Operational Reports</Link>
            </div>
          </div>
        </aside>
      </main>

      {modalState.isOpen && (
        <FeedbackModal 
          proposal={modalState.proposal}
          mode={modalState.mode}
          onClose={() => setModalState({ isOpen: false, proposal: null, mode: null })}
          onSubmit={handleModalSubmit}
        />
      )}
      
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
