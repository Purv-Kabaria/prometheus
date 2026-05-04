"use client";

import React, { useState, useEffect } from 'react';
import Card from '@/components/Card';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend } from 'recharts';

const GEN_API = 'http://127.0.0.1:8000/api/live-comparison/generation';
const EQ_API = 'http://127.0.0.1:8000/api/live-comparison/equipment';

const COLORS = {
  coal_baseload_mw: '#34495e',
  solar_mw: '#f1c40f',
  wind_mw: '#3498db',
  hydro_mw: '#2ecc71',
  gas_peaker_mw: '#e74c3c'
};

const LABELS = {
  coal_baseload_mw: 'Coal Baseload',
  solar_mw: 'Solar',
  wind_mw: 'Wind',
  hydro_mw: 'Hydro',
  gas_peaker_mw: 'Gas Peaker'
};

export default function GridSimulationPage() {
  const [telemetry, setTelemetry] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [genRes, eqRes] = await Promise.all([
        fetch(GEN_API),
        fetch(EQ_API)
      ]);
      if (genRes.ok) {
        const genData = await genRes.json();
        setTelemetry(genData);
      }
      if (eqRes.ok) {
        const eqData = await eqRes.json();
        setEquipment(eqData.equipment || []);
      }
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch simulation data", err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // refresh every 5 seconds for simulation feel
    return () => clearInterval(interval);
  }, []);

  if (loading || !telemetry) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--surface-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const pieData = Object.entries(telemetry.generation_mix).map(([key, value]) => ({
    name: LABELS[key],
    value: value,
    fill: COLORS[key]
  })).filter(d => d.value > 0);

  return (
    <div style={{ paddingBottom: "80px" }}>
      <header style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 className="serif" style={{ fontSize: "36px", fontWeight: "400", marginBottom: "8px" }}>Grid Simulation Live</h1>
          <p style={{ color: "var(--muted)", fontSize: "15px" }}>Real-time dynamic visualization of power generation and asset health</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--success)", animation: "pulse 1.5s infinite" }}></div>
          <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--success)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Live Telemetry</span>
        </div>
      </header>

      {/* Top Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "20px", marginBottom: "32px" }}>
        <Card title="Total Generation" value={`${telemetry.total_generation_mw.toLocaleString()} MW`} subtext="Committed Output" accentColor="var(--primary)" />
        <Card title="Forecast Demand" value={`${telemetry.forecast_demand_mw.toLocaleString()} MW`} subtext="P50 Target" accentColor="var(--success)" />
        <Card title="Headroom" value={`${telemetry.headroom_mw.toLocaleString()} MW`} subtext="Spinning Reserve" accentColor={telemetry.headroom_mw < 0 ? 'var(--danger)' : 'var(--success)'} />
        <Card title="Reserve Margin" value={`${telemetry.reserve_margin_pct}%`} subtext="Target 8-15%" accentColor="var(--warning)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "32px", marginBottom: "32px" }}>
        {/* Topology Visualization */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "24px", position: "relative", minHeight: "450px", overflow: "hidden" }}>
          <h3 style={{ fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: "24px" }}>Power Flow Topology</h3>
          
          <div className="topology-container" style={{ position: "absolute", top: "80px", left: 0, right: 0, bottom: "20px" }}>
            {/* Grid Node */}
            <div style={{ position: "absolute", left: "50%", top: "45%", transform: "translate(-50%, -50%)", width: "120px", height: "120px", borderRadius: "50%", background: "radial-gradient(circle, var(--accent) 0%, var(--surface) 100%)", border: "2px solid var(--primary)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10, boxShadow: "0 0 30px rgba(0, 102, 204, 0.2)" }}>
               <span style={{ fontSize: "16px", fontWeight: "700", color: "var(--foreground)" }}>MAIN GRID</span>
               <span style={{ fontSize: "12px", color: telemetry.reserve_margin_pct < 0 ? 'var(--danger)' : telemetry.reserve_margin_pct < 8 ? 'var(--warning)' : 'var(--primary)', fontWeight: "600" }}>
                 {(() => {
                   const rm = telemetry.reserve_margin_pct;
                   if (rm < 0) return `${(49.5 + Math.max(-0.3, rm / 100 * 2)).toFixed(2)} Hz`;
                   if (rm < 8) return `${(49.80 + (rm / 8) * 0.15).toFixed(2)} Hz`;
                   return '49.99 Hz';
                 })()}
               </span>
            </div>

            {/* Demand Node */}
            <div style={{ position: "absolute", left: "50%", bottom: "20px", transform: "translateX(-50%)", width: "160px", padding: "12px", background: "var(--surface)", border: "2px solid var(--success)", borderRadius: "8px", textAlign: "center", zIndex: 10 }}>
               <div style={{ fontSize: "12px", color: "var(--muted)", textTransform: "uppercase", fontWeight: "600" }}>Demand Sink</div>
               <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--foreground)" }}>{telemetry.forecast_demand_mw.toLocaleString()} MW</div>
            </div>

            {/* Connecting lines from Grid to Demand */}
            <div className="flow-line active-flow" style={{ position: "absolute", left: "50%", top: "55%", width: "4px", height: "calc(45% - 60px)", background: "var(--success)", transform: "translateX(-50%)", zIndex: 1 }}></div>

            {/* Source Nodes */}
            {Object.entries(telemetry.generation_mix).map(([key, value], i) => {
              const angles = [-150, -90, -30, 30, 150]; // Positions around the top arc
              const angle = angles[i];
              const rad = angle * (Math.PI / 180);
              const distance = 160;
              
              // Center coordinates (50%, 45%)
              const cx = 50; 
              const cy = 45;
              
              // Calculate offsets taking into account aspect ratio roughly
              const x = cx + Math.sin(rad) * 30; 
              const y = cy - Math.cos(rad) * 35;

              const isActive = value > 0;
              const color = COLORS[key];

              return (
                <div key={key}>
                  {/* The Source Node */}
                  <div style={{ 
                    position: "absolute", 
                    left: `${x}%`, top: `${y}%`, 
                    transform: "translate(-50%, -50%)", 
                    width: "90px", padding: "8px", 
                    background: "var(--surface)", 
                    border: `2px solid ${isActive ? color : 'var(--surface-border)'}`, 
                    borderRadius: "8px", 
                    textAlign: "center", 
                    zIndex: 10,
                    opacity: isActive ? 1 : 0.5,
                    boxShadow: isActive ? `0 0 15px ${color}40` : 'none',
                    transition: 'all 0.5s ease'
                  }}>
                    <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{LABELS[key]}</div>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: isActive ? color : 'var(--muted)' }}>{value.toLocaleString()} MW</div>
                  </div>

                  {/* Connecting Line to Grid */}
                  {/* We use SVG for better line drawing */}
                  <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: 'none' }}>
                    <line 
                      x1={`${x}%`} y1={`${y}%`} 
                      x2="50%" y2="45%" 
                      stroke={isActive ? color : 'var(--surface-border)'} 
                      strokeWidth={isActive ? Math.max(2, (value / 5000) * 8) : 1} 
                      className={isActive ? "active-flow-svg" : ""}
                      strokeDasharray={isActive ? "10, 5" : "none"}
                    />
                  </svg>
                </div>
              );
            })}
          </div>
        </div>

        {/* Generation Mix Chart */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "24px", display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: "16px" }}>Real-time Mix</h3>
          <div style={{ position: "relative", width: "100%", height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  animationDuration={800}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  formatter={(value) => `${value.toLocaleString()} MW`}
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: '8px' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Asset Health Panel */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "24px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: "24px" }}>Live Asset Health & Maintenance Tracking</h3>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" }}>
          {equipment.map(eq => (
            <div key={eq.id} style={{ padding: "16px", background: "var(--background)", borderRadius: "8px", border: "1px solid var(--surface-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: "700" }}>{eq.id} <span style={{ fontWeight: "400", color: "var(--muted)" }}>({eq.capacity_mw} MW)</span></div>
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>{eq.type}</div>
                </div>
                <span style={{ 
                  padding: "2px 8px", borderRadius: "12px", fontSize: "10px", fontWeight: "700", textTransform: "uppercase",
                  background: eq.overdue ? "rgba(231, 76, 60, 0.1)" : "rgba(46, 204, 113, 0.1)",
                  color: eq.overdue ? "var(--danger)" : "var(--success)"
                }}>
                  {eq.overdue ? 'Needs Maint' : 'Active'}
                </span>
              </div>
              
              <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
                <span>Health Index</span>
                <span style={{ color: eq.health_pct < 30 ? 'var(--danger)' : eq.health_pct < 60 ? 'var(--warning)' : 'var(--success)', fontWeight: '600' }}>{eq.health_pct}%</span>
              </div>
              <div style={{ width: "100%", height: "6px", background: "var(--surface-border)", borderRadius: "3px", overflow: "hidden", marginBottom: "12px" }}>
                <div style={{ 
                  width: `${eq.health_pct}%`, height: "100%", 
                  background: eq.health_pct < 30 ? 'var(--danger)' : eq.health_pct < 60 ? 'var(--warning)' : 'var(--success)',
                  transition: "width 1s ease-in-out"
                }}></div>
              </div>
              
              <div style={{ fontSize: "11px", color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
                <span>Last Maintained: {eq.last_maintained}</span>
                <span>Interval: {eq.maintenance_interval_days}d</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes dash {
          to { stroke-dashoffset: -20; }
        }
        @keyframes flowDown {
          0% { background-position: 0 -100px; }
          100% { background-position: 0 100%; }
        }
        
        .active-flow-svg {
          animation: dash 1s linear infinite;
        }
        
        .active-flow {
          background-image: linear-gradient(to bottom, transparent 50%, rgba(255,255,255,0.5) 50%);
          background-size: 100% 20px;
          animation: flowDown 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
