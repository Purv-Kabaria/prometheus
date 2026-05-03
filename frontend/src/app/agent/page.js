"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Card from '@/components/Card';
import ProposalCard from '@/components/agent/ProposalCard';
import FeedbackModal from '@/components/agent/FeedbackModal';

const API_BASE = 'http://localhost:8000/api/agent';
const FORECAST_API = 'http://localhost:8000/api/forecast/24h';

export default function AgentDecisionsPage() {
  const [proposals, setProposals]     = useState([]);
  const [agentRunning, setAgentRunning] = useState(false);
  const [userPrompt, setUserPrompt]   = useState('');
  const defaultMessages = [
    { role: 'agent', text: 'Prometheus Intelligence online. I am monitoring the grid for imbalances and maintenance opportunities. How can I assist you today?', timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }
  ];
  
  const [messages, setMessages]       = useState(defaultMessages);
  const [modalState, setModalState]   = useState({ isOpen: false, proposal: null, mode: null });
  const [telemetry, setTelemetry]     = useState({ demand: null, generation: null });
  const [stats, setStats]             = useState({ total: 0, accepted: 0, rejected: 0, overridden: 0 });
  
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const saved = sessionStorage.getItem('prometheus_chat');
    if (saved) {
      try { setMessages(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem('prometheus_chat', JSON.stringify(messages));
    scrollToBottom();
  }, [messages]);

  // ── Fetch proposals & derive stats ──────────────────────────────────────────
  const fetchProposals = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/proposals`);
      const data = await res.json();
      const all  = data.proposals || [];
      setProposals(all);
      setStats({
        total:     all.length,
        accepted:  all.filter(p => p.status === 'accepted').length,
        rejected:  all.filter(p => p.status === 'rejected').length,
        overridden: all.filter(p => p.status === 'overridden').length,
      });
    } catch { /* backend may not be ready yet */ }
  }, []);

  // ── Fetch live telemetry from forecast API ───────────────────────────────────
  const fetchTelemetry = useCallback(async () => {
    try {
      const res  = await fetch(FORECAST_API);
      const data = await res.json();
      const currentHour = new Date().getHours();
      const slot = data.slots?.[currentHour];
      const peak = data.summary?.peak_mw;
      if (slot) {
        setTelemetry({
          demand:     slot.p50,
          generation: peak ? Math.round(peak * 1.10) : null,
        });
      }
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => {
    fetchProposals();
    fetchTelemetry();
    const t = setInterval(() => { fetchProposals(); fetchTelemetry(); }, 60000);
    return () => clearInterval(t);
  }, [fetchProposals, fetchTelemetry]);

  // ── Poll until a job_id resolves ────────────────────────────────────────────
  const pollJobResult = async (job_id) => {
    for (let i = 0; i < 48; i++) {                   // max ~2 min, every 2.5s
      await new Promise(r => setTimeout(r, 2500));
      try {
        const res  = await fetch(`${API_BASE}/status/${job_id}`);
        const data = await res.json();
        if (data.status === 'done' || data.status === 'error') {
          return data.details;
        }
      } catch { /* retry */ }
    }
    return null;   // timed out
  };

  // ── Trigger agent run ────────────────────────────────────────────────────────
  const triggerAgent = async (e) => {
    if (e) e.preventDefault();
    if (!userPrompt.trim() && !agentRunning) {
        // Allow blank for general scan
    } else if (!userPrompt.trim()) return;

    const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const userMsg = userPrompt.trim() || "Run general grid scan";
    
    setMessages(prev => [...prev, { role: 'user', text: userMsg, timestamp: ts }]);
    setUserPrompt('');
    setAgentRunning(true);

    try {
      const body = userMsg !== "Run general grid scan" ? { prompt: userMsg } : {};
      const res  = await fetch(`${API_BASE}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const { job_id } = await res.json();
      const result = await pollJobResult(job_id);
      const reply  = result?.final_response;
      
      if (reply) {
        setMessages(prev => [...prev, { role: 'agent', text: reply, timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }]);
      } else if (!result) {
        setMessages(prev => [...prev, { role: 'agent', text: 'Request timed out. Please check backend connectivity.', timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }]);
      }
      await fetchProposals();
    } catch (err) {
      setMessages(prev => [...prev, { role: 'agent', text: `System Error: ${err.message}. Please check if the backend is running.`, timestamp: ts }]);
    }
    setAgentRunning(false);
  };

  const handleModalSubmit = async (feedbackData) => {
    try {
      const currentProposal = modalState.proposal;
      await fetch(`${API_BASE}/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackData),
      });
      setModalState({ isOpen: false, proposal: null, mode: null });
      
      const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const actionLabel = feedbackData.status === 'accepted' ? 'Accepted' : 
                          feedbackData.status === 'rejected' ? 'Rejected' : 'Overridden';
      
      setMessages(prev => [...prev, { 
        role: 'agent', 
        text: `Action Confirmed: ${actionLabel} ${currentProposal?.action_type} proposal ${currentProposal?.id}. Log entry created in grid database.`, 
        timestamp: ts 
      }]);
      
      await fetchProposals();

      if (feedbackData.status === 'overridden' && feedbackData.reason) {
        const overridePrompt = `I am rejecting your previous proposal (${currentProposal?.id}). Reason: ${feedbackData.reason}. Please generate a NEW proposal taking this exact feedback into account.`;
        setMessages(prev => [...prev, { role: 'user', text: overridePrompt, timestamp: ts }]);
        
        setAgentRunning(true);
        try {
          const res  = await fetch(`${API_BASE}/trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: overridePrompt }),
          });
          const { job_id } = await res.json();
          const result = await pollJobResult(job_id);
          const reply  = result?.final_response;
          if (reply) {
            setMessages(prev => [...prev, { role: 'agent', text: reply, timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }]);
          }
          await fetchProposals();
        } catch (err) {
          setMessages(prev => [...prev, { role: 'agent', text: `System Error during override: ${err.message}`, timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }]);
        }
        setAgentRunning(false);
      }
    } catch { /* ignore */ }
  };

  const pendingCount = proposals.filter(p => p.status === 'pending_approval').length;
  const surplus = telemetry.generation && telemetry.demand
    ? telemetry.generation - telemetry.demand : null;

  return (
    <div style={{ height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "32px", flexShrink: 0 }}>
        <div>
          <h1 className="serif" style={{ fontSize: "32px", fontWeight: "400", marginBottom: "4px" }}>
            Prometheus Agent
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "14px" }}>
            Autonomous grid monitoring & decision support
          </p>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "6px 12px", background: "var(--surface)",
          border: "1px solid var(--surface-border)", borderRadius: "20px"
        }}>
          <div style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: agentRunning ? "var(--warning)" : "var(--success)",
            animation: agentRunning ? "pulse 1s ease-in-out infinite" : "none"
          }} />
          <span style={{ fontSize: "12px", fontWeight: "500", color: "var(--muted)" }}>
            {agentRunning ? 'Agent Processing' : 'Agent Ready'}
          </span>
        </div>
      </header>

      {/* ── Main content area ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "32px", flex: 1, minHeight: 0 }}>
        
        {/* Left Column: Proposals & Telemetry */}
        <div style={{ display: "flex", flexDirection: "column", gap: "32px", overflowY: "auto", paddingRight: "12px" }}>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Card
              title="Generation"
              value={telemetry.generation ? `${telemetry.generation.toLocaleString()} MW` : '—'}
              subtext="Current estimate"
              accentColor="var(--primary)"
            />
            <Card
              title="Demand"
              value={telemetry.demand ? `${Math.round(telemetry.demand).toLocaleString()} MW` : '—'}
              subtext="Forecast P50"
              accentColor="var(--success)"
            />
          </div>

          <section>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <h2 className="serif" style={{ fontSize: "20px", fontWeight: "400" }}>Action Queue</h2>
              {pendingCount > 0 && (
                <span style={{
                  background: "rgba(192,57,43,0.1)", color: "var(--danger)",
                  fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "10px"
                }}>
                  {pendingCount} PENDING
                </span>
              )}
            </div>

            {proposals.length === 0 ? (
              <div style={{
                background: "var(--surface)", border: "1px solid var(--surface-border)",
                borderRadius: "var(--radius)", padding: "48px", textAlign: "center"
              }}>
                <p style={{ color: "var(--muted)", fontSize: "13px" }}>
                  No active proposals. Interact with the agent to analyze the grid.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {proposals.map(prop => (
                  <ProposalCard
                    key={prop.id}
                    proposal={prop}
                    onAccept={() => setModalState({ isOpen: true, proposal: prop, mode: 'accept' })}
                    onReject={() => setModalState({ isOpen: true, proposal: prop, mode: 'reject' })}
                    onOverride={() => setModalState({ isOpen: true, proposal: prop, mode: 'override' })}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Chat Window */}
        <aside style={{ 
          background: "var(--surface)", 
          border: "1px solid var(--surface-border)", 
          borderRadius: "var(--radius)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0,0,0,0.05)"
        }}>
          {/* Chat Header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--surface-border)", background: "var(--accent)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ fontSize: "11px", fontWeight: "700", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
              Prometheus Intelligence Chat
            </h4>
            <button 
              onClick={() => { setMessages(defaultMessages); sessionStorage.removeItem('prometheus_chat'); }}
              style={{ background: "transparent", border: "1px solid var(--surface-border)", borderRadius: "4px", color: "var(--muted)", fontSize: "10px", fontWeight: "600", padding: "4px 8px", cursor: "pointer", transition: "all 0.2s" }}
              onMouseOver={(e) => e.target.style.background = 'var(--surface)'}
              onMouseOut={(e) => e.target.style.background = 'transparent'}
            >
              RESET
            </button>
          </div>

          {/* Messages Area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ 
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: "85%",
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
              }}>
                <div style={{ 
                  background: msg.role === 'user' ? 'var(--primary)' : 'var(--accent)',
                  color: msg.role === 'user' ? 'white' : 'var(--foreground)',
                  padding: "12px 16px",
                  borderRadius: msg.role === 'user' ? "16px 16px 2px 16px" : "16px 16px 16px 2px",
                  fontSize: "13px",
                  lineHeight: "1.5",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                }}>
                  {msg.text}
                </div>
                <span style={{ fontSize: "9px", color: "var(--muted)", marginTop: "4px", fontWeight: "600" }}>
                  {msg.role === 'agent' ? 'PROMETHEUS' : 'OFFICER'} · {msg.timestamp}
                </span>
              </div>
            ))}
            
            {agentRunning && (
              <div style={{ 
                alignSelf: 'flex-start',
                maxWidth: "85%",
                display: "flex",
                flexDirection: "column",
                alignItems: 'flex-start'
              }}>
                <div style={{ 
                  background: 'var(--accent)',
                  color: 'var(--foreground)',
                  padding: "16px 24px",
                  borderRadius: "16px 16px 16px 2px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  display: "flex",
                  alignItems: "center",
                  height: "46px"
                }}>
                  <div className="dot-typing"></div>
                </div>
                <span style={{ fontSize: "9px", color: "var(--muted)", marginTop: "4px", fontWeight: "600" }}>
                  PROMETHEUS · Analyzing...
                </span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={triggerAgent} style={{ padding: "16px", borderTop: "1px solid var(--surface-border)", background: "var(--background)" }}>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={userPrompt}
                onChange={e => setUserPrompt(e.target.value)}
                placeholder="Ask Prometheus..."
                disabled={agentRunning}
                style={{
                  width: "100%",
                  background: "var(--surface)",
                  border: "1px solid var(--surface-border)",
                  borderRadius: "8px",
                  padding: "12px 48px 12px 16px",
                  fontSize: "13px",
                  color: "var(--foreground)",
                  outline: "none",
                  transition: "border-color 0.2s"
                }}
              />
              <button
                type="submit"
                disabled={agentRunning}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "var(--primary)",
                  color: "white",
                  width: "32px",
                  height: "32px",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: agentRunning ? 0.5 : 1
                }}
              >
                {agentRunning ? (
                  <div style={{ width: "12px", height: "12px", border: "2px solid white", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                )}
              </button>
            </div>
            <p style={{ fontSize: "10px", color: "var(--muted)", textAlign: "center", marginTop: "12px" }}>
              Agent can analyze solar curtailment, maintenance, and grid stability.
            </p>
          </form>
        </aside>
      </div>

      {/* ── Feedback modal ───────────────────────────────────────────────────── */}
      {modalState.isOpen && (
        <FeedbackModal
          proposal={modalState.proposal}
          mode={modalState.mode}
          onClose={() => setModalState({ isOpen: false, proposal: null, mode: null })}
          onSubmit={handleModalSubmit}
        />
      )}

      <style jsx>{`
        @keyframes spin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .dot-typing {
          position: relative;
          left: -9999px;
          width: 6px;
          height: 6px;
          border-radius: 5px;
          background-color: var(--primary);
          color: var(--primary);
          box-shadow: 9984px 0 0 0 var(--primary), 9999px 0 0 0 var(--primary), 10014px 0 0 0 var(--primary);
          animation: dot-typing 1.5s infinite linear;
        }
        @keyframes dot-typing {
          0% { box-shadow: 9984px 0 0 0 var(--primary), 9999px 0 0 0 var(--primary), 10014px 0 0 0 var(--primary); }
          16.667% { box-shadow: 9984px -6px 0 0 var(--primary), 9999px 0 0 0 var(--primary), 10014px 0 0 0 var(--primary); }
          33.333% { box-shadow: 9984px 0 0 0 var(--primary), 9999px 0 0 0 var(--primary), 10014px 0 0 0 var(--primary); }
          50% { box-shadow: 9984px 0 0 0 var(--primary), 9999px -6px 0 0 var(--primary), 10014px 0 0 0 var(--primary); }
          66.667% { box-shadow: 9984px 0 0 0 var(--primary), 9999px 0 0 0 var(--primary), 10014px 0 0 0 var(--primary); }
          83.333% { box-shadow: 9984px 0 0 0 var(--primary), 9999px 0 0 0 var(--primary), 10014px -6px 0 0 var(--primary); }
          100% { box-shadow: 9984px 0 0 0 var(--primary), 9999px 0 0 0 var(--primary), 10014px 0 0 0 var(--primary); }
        }
      `}</style>
    </div>
  );
}
