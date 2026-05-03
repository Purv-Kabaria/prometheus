import React from 'react';

export default function ProposalCard({ proposal, onAccept, onReject, onOverride }) {
  if (!proposal) return null;
  
  return (
    <div className="border border-purple-200 rounded-lg p-5 bg-white shadow-sm mb-4 transition-all hover:border-purple-300 hover:shadow-md">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xl">
            A
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Agent Proposal: {proposal.action_type.toUpperCase()}</h3>
            <span className="text-xs text-gray-500">ID: {proposal.id}</span>
          </div>
        </div>
        <span className="text-xs font-semibold px-3 py-1 bg-green-100 text-green-800 rounded-full border border-green-200">
          92% Confidence
        </span>
      </div>
      
      <div className="bg-gray-50 border border-gray-100 rounded p-3 mb-4">
        <p className="text-sm text-gray-700 leading-relaxed">
          <strong>Rationale:</strong> {proposal.rationale}
        </p>
      </div>
      
      <div className="flex items-center justify-between mt-2 pt-3 border-t border-gray-100">
        <div className="text-sm font-medium text-gray-800 bg-blue-50 px-3 py-1.5 rounded text-blue-800 border border-blue-100">
          Target: {proposal.target_mwh} MWh @ {proposal.target_hour}
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => onReject(proposal)}
            className="px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded border border-red-200 transition-colors"
          >
            Reject
          </button>
          <button 
            onClick={() => onOverride(proposal)}
            className="px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded border border-blue-200 transition-colors"
          >
            Override
          </button>
          <button 
            onClick={() => onAccept(proposal)}
            className="px-4 py-1.5 text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 rounded transition-colors shadow-sm"
          >
            Accept Proposal
          </button>
        </div>
      </div>
    </div>
  );
}
