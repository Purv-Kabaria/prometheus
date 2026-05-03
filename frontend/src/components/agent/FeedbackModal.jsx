import React, { useState, useEffect } from 'react';

export default function FeedbackModal({ proposal, mode, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [mwh, setMwh] = useState("");

  // Update local state when proposal changes
  useEffect(() => {
    if (proposal) {
      setMwh(proposal.target_mwh);
      setReason("");
    }
  }, [proposal]);

  if (!proposal) return null;

  const handleSubmit = () => {
    onSubmit({
      proposal_id: proposal.id,
      status: mode === 'reject' ? 'rejected' : 'overridden',
      reason,
      overridden_mwh: mode === 'override' ? parseFloat(mwh) : null
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className={`px-6 py-4 border-b ${mode === 'reject' ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
          <h3 className={`text-lg font-semibold ${mode === 'reject' ? 'text-red-800' : 'text-blue-800'}`}>
            {mode === 'reject' ? 'Reject Agent Proposal' : 'Override Proposal Targets'}
          </h3>
          <p className="text-xs text-gray-500 mt-1">Proposal {proposal.id}</p>
        </div>
        
        <div className="p-6">
          {mode === 'override' && (
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Target MWh
              </label>
              <div className="flex items-center">
                <input 
                  type="number" 
                  value={mwh}
                  onChange={(e) => setMwh(e.target.value)}
                  className="w-full border border-gray-300 rounded-l-md px-3 py-2 text-black focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
                <span className="bg-gray-100 border border-l-0 border-gray-300 rounded-r-md px-3 py-2 text-gray-500 text-sm">
                  MWh
                </span>
              </div>
            </div>
          )}
          
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Officer Rationale <span className="text-gray-400 font-normal">(Optional but recommended)</span>
            </label>
            <textarea 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-3 text-black focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              rows="3"
              placeholder="e.g., Contractual minimums prevent curtailment below 4500 MW..."
            ></textarea>
          </div>
        </div>
        
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors shadow-sm
              ${mode === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            Submit to Database
          </button>
        </div>
      </div>
    </div>
  );
}
