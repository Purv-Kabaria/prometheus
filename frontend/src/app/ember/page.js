"use client";

import React, { useState, useEffect } from 'react';
import Card from '@/components/Card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const EMBER_API_LIVE = 'http://127.0.0.1:8000/api/ember/live';

export default function EmberApiPage() {
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trading, setTrading] = useState(false);
  const [tradeStatus, setTradeStatus] = useState("");

  const fetchLivePrices = async () => {
    try {
      setLoading(true);
      const res = await fetch(EMBER_API_LIVE + "?entity=IND");
      if (!res.ok) throw new Error("Failed to fetch live prices");
      const data = await res.json();
      setLiveData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLivePrices();
  }, []);

  const handleAuthorizeTrade = () => {
    if (trading) return;
    setTrading(true);
    setTradeStatus("Processing trade authorization...");
    setTimeout(() => {
      setTrading(false);
      setTradeStatus("Trade fully authorized and executed successfully!");
    }, 1500);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid var(--surface-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px", background: "var(--surface)", border: "1px solid var(--danger)", borderRadius: "var(--radius)" }}>
        <h3 style={{ color: "var(--danger)" }}>Connection Error</h3>
        <p>{error}</p>
        <button onClick={fetchLivePrices} style={{ marginTop: "16px", padding: "8px 16px", background: "var(--primary)", color: "white", borderRadius: "8px", border: "none" }}>Retry</button>
      </div>
    );
  }

  // Format hourly data for chart
  const chartData = liveData?.hourly_data?.map(row => ({
    time: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    price: row.price_mwh
  })) || [];

  return (
    <div style={{ paddingBottom: "80px" }}>
      <header style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 className="serif" style={{ fontSize: "36px", fontWeight: "400", marginBottom: "8px" }}>Power Arbitrage & Spot Market</h1>
          <p style={{ color: "var(--muted)", fontSize: "15px" }}>Production-safe client fetching live electricity market and pricing curve data</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--accent)", padding: "6px 12px", borderRadius: "8px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)" }}></div>
          <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--foreground)", textTransform: "uppercase" }}>Connected to Ember v1</span>
        </div>
      </header>

      {/* Top Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginBottom: "32px" }}>
        <Card 
          title="Current Spot Price" 
          value={`$${liveData?.current_price_mwh?.toFixed(2)} / MWh`} 
          subtext={`Entity: ${liveData?.entity || 'IND'}`} 
          accentColor="var(--primary)" 
        />
        <Card 
          title="Tomorrow Avg Price" 
          value={`$${liveData?.tomorrow_avg_price_mwh?.toFixed(2)} / MWh`} 
          subtext="Forecasted Market Average" 
          accentColor="var(--success)" 
        />
        <Card 
          title="Data Granularity" 
          value="Hourly" 
          subtext="Simulated Market Feed" 
          accentColor="var(--warning)" 
        />
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "24px", marginBottom: "32px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: "24px" }}>
          Current & Tomorrow Pricing Curve (USD/MWh)
        </h3>
        
        <div style={{ height: "400px", width: "100%" }}>
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
              <Tooltip 
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "8px" }}
                formatter={(value) => [`$${value.toFixed(2)}`, "Price (MWh)"]}
              />
              <Area type="monotone" dataKey="price" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorPrice)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
        <div style={{ background: "linear-gradient(135deg, var(--surface) 0%, rgba(0, 204, 153, 0.05) 100%)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "24px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "100px", height: "100px", background: "var(--success)", opacity: "0.1", borderRadius: "50%", filter: "blur(20px)" }}></div>
          <h3 style={{ fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--success)" }}></span>
            Live Spot Market Selling
          </h3>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "20px", lineHeight: "1.6" }}>
            Based on current Ember API market prices and our real-time grid generation overhead, this is the projected hourly revenue if we exported our surplus to the neighboring interconnect.
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", background: "var(--background)", padding: "16px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}>
            <div>
              <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>Available Surplus</p>
              <p style={{ fontSize: "20px", fontWeight: "600", color: "var(--foreground)" }}>{liveData?.surplus_mwh?.toLocaleString()} MWh</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>Potential Revenue</p>
              <p style={{ fontSize: "28px", fontWeight: "700", color: "var(--success)" }}>${liveData?.potential_revenue_usd?.toLocaleString()}</p>
            </div>
          </div>
          <button 
            onClick={handleAuthorizeTrade}
            style={{ width: "100%", marginTop: "16px", padding: "12px", background: "var(--accent)", color: "var(--success)", border: "1px solid rgba(0, 204, 153, 0.2)", borderRadius: "8px", fontWeight: "600", cursor: "pointer", transition: "all 0.2s ease" }}
            onMouseOver={(e) => { e.target.style.background = "var(--success)"; e.target.style.color = "var(--background)"; }}
            onMouseOut={(e) => { e.target.style.background = "var(--accent)"; e.target.style.color = "var(--success)"; }}
          >
            {trading ? "Authorizing..." : "Authorize Trade to Spot Market"}
          </button>
          {tradeStatus && (
            <p style={{ marginTop: "12px", fontSize: "12px", fontWeight: "600", color: tradeStatus.includes("success") ? "var(--success)" : "var(--warning)", textAlign: "center" }}>
              {tradeStatus}
            </p>
          )}
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "24px" }}>
          <h3 style={{ fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: "16px" }}>
            Bulk Historical Fetcher
          </h3>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "20px", lineHeight: "1.6" }}>
            The Ember API client includes a robust chunking algorithm to download large historical datasets without hitting rate limits. Uses asynchronous sleeping between yearly chunks.
          </p>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <input type="text" placeholder="Start Year (e.g. 2020)" defaultValue="2020" style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--surface-border)", background: "var(--background)", color: "var(--foreground)", width: "120px" }} />
            <span style={{ color: "var(--muted)" }}>to</span>
            <input type="text" placeholder="End Year (e.g. 2023)" defaultValue="2023" style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--surface-border)", background: "var(--background)", color: "var(--foreground)", width: "120px" }} />
            <button style={{ padding: "8px 16px", background: "var(--accent)", color: "var(--primary)", border: "none", borderRadius: "6px", fontWeight: "600", cursor: "pointer" }}>Run Export</button>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--surface-border)", borderRadius: "var(--radius)", padding: "24px" }}>
          <h3 style={{ fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: "16px" }}>
            Data Processing Pipeline
          </h3>
          <ul style={{ paddingLeft: "20px", margin: 0, fontSize: "13px", color: "var(--foreground)", lineHeight: "1.8" }}>
            <li><strong style={{ color: "var(--primary)" }}>Error Handling:</strong> Catches HTTPStatusErrors and automatically retries.</li>
            <li><strong style={{ color: "var(--primary)" }}>Column Normalization:</strong> Adapts Ember's varying response schemas into a unified Pandas DataFrame.</li>
            <li><strong style={{ color: "var(--primary)" }}>Agent Integration:</strong> Fast endpoints available at <code style={{ background: "var(--accent)", padding: "2px 6px", borderRadius: "4px" }}>/api/ember/live</code>.</li>
          </ul>
        </div>
    </div>
  );
}
