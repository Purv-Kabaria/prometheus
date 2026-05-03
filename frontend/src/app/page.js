"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import ProposalCard from '../components/agent/ProposalCard';
import FeedbackModal from '../components/agent/FeedbackModal';

const API_BASE = 'http://localhost:8000/api/agent';

export default function GridOfficerDashboard() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalState, setModalState] = useState({ isOpen: false, proposal: null, mode: null });

  const fetchProposals = async () => {
    try {
      const res = await fetch(`${API_BASE}/proposals`);
      const data = await res.json();
      setProposals(data.proposals || []);
    } catch (err) {
      console.error("Failed to fetch proposals. Ensure backend is running.", err);
    }
  };

  // Fetch proposals on initial load
  useEffect(() => {
    fetchProposals();
  }, []);

  const triggerAgent = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/trigger`, { method: 'POST' });
      await fetchProposals(); // Refresh to show the new proposal
    } catch (err) {
      console.error("Failed to trigger agent:", err);
      alert("Failed to connect to backend. Make sure FastAPI is running on port 8000.");
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
      await fetchProposals(); // Refresh list after resolving
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
      await fetchProposals(); // Refresh list after resolving
    } catch (err) {
      console.error("Failed to submit feedback:", err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans">
      <header className="mb-10 flex justify-between items-center max-w-5xl mx-auto border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Prometheus Grid Control</h1>
          <p className="text-gray-500 mt-1">Agent-Assisted Decisions Dashboard</p>
        </div>
        <button 
          onClick={triggerAgent}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          ) : null}
          {loading ? 'Simulating...' : 'Trigger Agent Simulation'}
        </button>
      </header>

      <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Left Column: Proposals Feed */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              Action Queue
              <span className="bg-purple-100 text-purple-800 py-0.5 px-2.5 rounded-full text-sm font-bold">
                {proposals.length}
              </span>
            </h2>
          </div>
          
          {proposals.length === 0 ? (
            <div className="bg-white border border-gray-200 border-dashed rounded-xl p-12 text-center shadow-sm">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <h3 className="text-gray-900 font-medium mb-1">Grid is stable</h3>
              <p className="text-gray-500 text-sm mb-4">No pending agent proposals requiring your attention.</p>
              <button 
                onClick={triggerAgent}
                className="text-indigo-600 text-sm font-medium hover:text-indigo-800 underline"
              >
                Simulate an anomaly
              </button>
            </div>
          ) : (
            <div className="space-y-4">
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

        {/* Right Column: Grid State (Mocked) */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Current Grid State</h2>
          
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Live Telemetry</h4>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Committed Generation</span>
                  <span className="font-medium">5,000 MW</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full w-4/5"></div></div>
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Current Demand</span>
                  <span className="font-medium text-green-600">4,200 MW</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5"><div className="bg-green-500 h-1.5 rounded-full w-3/4"></div></div>
              </div>
            </div>
            
            <div className="mt-5 p-3 bg-amber-50 rounded border border-amber-100">
              <div className="flex gap-2">
                <span className="text-amber-500">⚠️</span>
                <p className="text-xs text-amber-800 leading-tight">
                  <span className="font-semibold">Over-generation warning:</span> Forecast suggests demand will drop further due to high solar output.
                </p>
              </div>
            </div>
          </div>

          {/* New Operational Intelligence Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ops Summary</h4>
              <Link href="/reporting" className="text-indigo-600 text-[10px] font-bold hover:underline">VIEW FULL</Link>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="bg-green-50 text-green-700 p-2 rounded-lg font-bold text-xl">98.4%</div>
              <div>
                <p className="text-xs font-semibold">Forecast Accuracy</p>
                <p className="text-[10px] text-gray-500">Last 24 hours</p>
              </div>
            </div>
            <button 
              onClick={() => window.location.href = '/reporting'}
              className="w-full py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded text-xs font-semibold text-gray-600 transition-colors"
            >
              Download Daily PDF
            </button>
          </div>
        </div>

      </main>

      {/* Render Modal if active */}
      {modalState.isOpen && (
        <FeedbackModal 
          proposal={modalState.proposal}
          mode={modalState.mode}
          onClose={() => setModalState({ isOpen: false, proposal: null, mode: null })}
          onSubmit={handleModalSubmit}
        />
      )}
    </div>
  );
}
