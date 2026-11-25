import React, { useState } from 'react';
import { X, FileText, CheckCircle, AlertTriangle, AlertOctagon, ChevronDown, ChevronUp } from 'lucide-react';
import type { MilkEntry } from '../store/collection/useMilkCollectionStore';

interface CalculationSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: MilkEntry | null;
}

export const CalculationSnapshotModal: React.FC<CalculationSnapshotModalProps> = ({
  isOpen,
  onClose,
  entry,
}) => {
  const [showRawJson, setShowRawJson] = useState(false);

  if (!isOpen || !entry) return null;

  const snapshot = entry.calculationSnapshot;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#f4f5f7]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#deebff] flex items-center justify-center text-[#0052cc]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#091e42]">Calculation Snapshot</h2>
              <p className="text-xs text-gray-500">
                Authoritative financial calculation & audit record
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200/50 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Status Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {entry.isReversed ? (
              <span className="px-2.5 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-md flex items-center gap-1">
                <AlertOctagon className="w-3.5 h-3.5" /> REVERSED
              </span>
            ) : entry.isCorrected ? (
              <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-md flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> CORRECTED
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-md flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> AUTHORITATIVE ACTIVE
              </span>
            )}

            <span className="px-2.5 py-1 bg-blue-50 text-[#0052cc] text-xs font-semibold rounded-md border border-blue-200">
              {entry.milkType} Milk • {entry.shift} Shift
            </span>
          </div>

          {/* Audit reasons if any */}
          {entry.isReversed && entry.reversalReason && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl">
              <span className="font-bold block mb-0.5">Reversal Reason:</span>
              <p>{entry.reversalReason}</p>
            </div>
          )}

          {entry.isCorrected && entry.correctionReason && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl">
              <span className="font-bold block mb-0.5">Correction Reason:</span>
              <p>{entry.correctionReason}</p>
            </div>
          )}

          {/* Customer & Collection Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs space-y-2">
            <div className="flex justify-between items-center border-b border-gray-200 pb-2">
              <span className="text-gray-500 font-medium">Customer:</span>
              <span className="font-bold text-gray-900">
                #{entry.customerCode} — {entry.customerName}
              </span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-200 pb-2">
              <span className="text-gray-500 font-medium">Collection Date:</span>
              <span className="font-medium text-gray-800">{entry.date}</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-200 pb-2">
              <span className="text-gray-500 font-medium">Quantity Recorded:</span>
              <span className="font-mono font-bold text-gray-900">{entry.quantity} Litres</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-200 pb-2">
              <span className="text-gray-500 font-medium">Quality Parameters:</span>
              <span className="font-mono text-gray-800">
                FAT: <strong>{entry.fat}%</strong> | SNF: <strong>{entry.snf}%</strong>
              </span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-200 pb-2">
              <span className="text-gray-500 font-medium">Authoritative Rate:</span>
              <span className="font-mono font-bold text-[#0052cc]">₹{entry.rate.toFixed(2)} / L</span>
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-gray-700 font-bold">Total Gross Amount:</span>
              <span className="text-base font-black text-[#091e42] font-mono">
                ₹{entry.totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Rate Chart & Calculation Snapshot Details */}
          {snapshot ? (
            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 text-xs space-y-2">
              <h4 className="font-bold text-blue-900 uppercase tracking-wider text-[11px] mb-2">
                Rate Chart Snapshot Data
              </h4>
              <div className="flex justify-between items-center border-b border-blue-100 pb-1.5">
                <span className="text-gray-600">Chart Name:</span>
                <span className="font-bold text-blue-950">{snapshot.rateChartName || '—'}</span>
              </div>
              <div className="flex justify-between items-center border-b border-blue-100 pb-1.5">
                <span className="text-gray-600">Chart ID:</span>
                <span className="font-mono text-gray-600 text-[11px] truncate max-w-[200px]">
                  {snapshot.rateChartId || entry.rateChartId || '—'}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-blue-100 pb-1.5">
                <span className="text-gray-600">Calculation Method:</span>
                <span className="font-semibold text-blue-800">{snapshot.calculationMethod || snapshot.method || '—'}</span>
              </div>
              {snapshot.baseRate !== undefined && (
                <div className="flex justify-between items-center border-b border-blue-100 pb-1.5">
                  <span className="text-gray-600">Base Rate:</span>
                  <span className="font-mono text-gray-800">₹{snapshot.baseRate}/L</span>
                </div>
              )}
              {snapshot.fatAdjustment !== undefined && (
                <div className="flex justify-between items-center border-b border-blue-100 pb-1.5">
                  <span className="text-gray-600">FAT Adjustment:</span>
                  <span className="font-mono text-gray-800">
                    {Number(snapshot.fatAdjustment) >= 0 ? '+' : ''}₹{snapshot.fatAdjustment}
                  </span>
                </div>
              )}
              {snapshot.snfAdjustment !== undefined && (
                <div className="flex justify-between items-center border-b border-blue-100 pb-1.5">
                  <span className="text-gray-600">SNF Adjustment:</span>
                  <span className="font-mono text-gray-800">
                    {Number(snapshot.snfAdjustment) >= 0 ? '+' : ''}₹{snapshot.snfAdjustment}
                  </span>
                </div>
              )}
              {snapshot.formulaDescription && (
                <div className="pt-1">
                  <span className="text-gray-600 block text-[11px] mb-0.5">Applied Formula:</span>
                  <span className="text-[11px] font-mono text-blue-900 bg-white/70 p-1.5 rounded block border border-blue-100">
                    {snapshot.formulaDescription}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500 italic text-center">
              Historical calculation snapshot was not recorded for this legacy entry.
            </div>
          )}

          {/* Collapsible Raw JSON */}
          {snapshot && (
            <div>
              <button
                type="button"
                onClick={() => setShowRawJson(!showRawJson)}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 cursor-pointer font-medium"
              >
                {showRawJson ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showRawJson ? 'Hide' : 'View'} Raw Snapshot JSON
              </button>

              {showRawJson && (
                <pre className="mt-2 p-3 bg-gray-900 text-emerald-400 font-mono text-[10px] rounded-xl overflow-x-auto max-h-48">
                  {JSON.stringify(snapshot, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-100 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

