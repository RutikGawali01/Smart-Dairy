import React from 'react';
import { X, AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import type { ActivationConflict } from '../rateChart.types';

interface ActivationConflictModalProps {
  isOpen: boolean;
  chartId: string;
  chartName: string;
  conflicts: ActivationConflict[];
  onClose: () => void;
  onConfirmReplace: (chartId: string) => void;
  isLoading?: boolean;
}

export const ActivationConflictModal: React.FC<ActivationConflictModalProps> = ({
  isOpen,
  chartId,
  chartName,
  conflicts,
  onClose,
  onConfirmReplace,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-amber-200 bg-amber-500 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-100" />
            <h3 className="font-bold text-sm tracking-wide">Rate Chart Activation Conflict</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-amber-100 hover:text-white transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs text-gray-700">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Overlapping Active Chart Detected</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Activating <strong>&ldquo;{chartName}&rdquo;</strong> conflicts with the following currently active chart:
            </p>
          </div>

          {/* Conflict List */}
          <div className="space-y-2 border border-gray-200 rounded-xl p-3 bg-gray-50">
            {conflicts.map((c, i) => (
              <div key={c.chartId || i} className="text-xs space-y-1">
                <span className="font-bold text-gray-900 block">{c.name}</span>
                <div className="text-[11px] text-gray-600 flex items-center gap-1.5 font-mono">
                  <span>From: {c.effectiveFrom ? new Date(c.effectiveFrom).toLocaleDateString() : '—'}</span>
                  <ArrowRight className="w-3 h-3 text-gray-400" />
                  <span>To: {c.effectiveTo ? new Date(c.effectiveTo).toLocaleDateString() : 'Open-ended'}</span>
                </div>
                {c.message && <p className="text-[10px] text-red-600 italic">{c.message}</p>}
              </div>
            ))}
          </div>

          {/* Action explanation */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] space-y-1.5">
            <span className="font-bold block">Proposed Safe Resolution:</span>
            <p>
              By confirming replacement, the system will automatically shorten the existing active chart&apos;s effective end date to the day immediately preceding this new chart&apos;s start date.
            </p>
            <p className="font-medium text-blue-800">
              No historical collection data will be affected.
            </p>
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => onConfirmReplace(chartId)}
              className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white rounded-lg transition shadow-md cursor-pointer flex items-center gap-2"
            >
              {isLoading ? 'Replacing & Activating...' : 'Confirm Replacement & Activate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
