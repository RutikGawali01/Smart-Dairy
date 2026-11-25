import React, { useState } from 'react';
import { X, AlertOctagon } from 'lucide-react';
import type { MilkEntry } from '../store/collection/useMilkCollectionStore';
import { useMilkCollectionStore } from '../store/collection/useMilkCollectionStore';

interface CollectionReversalModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: MilkEntry | null;
  onSuccess?: () => void;
}

export const CollectionReversalModal: React.FC<CollectionReversalModalProps> = ({
  isOpen,
  onClose,
  entry,
  onSuccess,
}) => {
  const { reverseCollectionEntry } = useMilkCollectionStore();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !entry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 3) {
      setErrorMsg('A reversal reason of at least 3 characters is mandatory.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const ok = await reverseCollectionEntry(entry.id, {
        reason: reason.trim(),
      });

      if (ok) {
        setReason('');
        onSuccess?.();
        onClose();
      } else {
        const storeError = useMilkCollectionStore.getState().error;
        setErrorMsg(storeError || 'Failed to reverse milk entry.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Reversal failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-red-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-100 bg-red-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-red-950">Reverse Milk Collection</h2>
              <p className="text-xs text-red-700/80">
                Audited financial reversal and settlement exclusion
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2">
              <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-3.5 bg-red-50/50 border border-red-200/60 rounded-xl text-xs text-red-800 space-y-1">
            <p className="font-semibold text-red-900">
              Warning: Reversing this milk entry is an irreversible audited action.
            </p>
            <p className="text-[11px] text-red-700">
              The entry will be marked as REVERSED and excluded from all daily intake totals, average FAT/SNF analytics, and periodic billing settlement payouts.
            </p>
          </div>

          {/* Entry Summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-700 space-y-1">
            <div className="flex justify-between font-semibold">
              <span>Customer: #{entry.customerCode} ({entry.customerName})</span>
              <span>{entry.shift} Shift</span>
            </div>
            <div className="flex justify-between text-gray-500 text-[11px]">
              <span>Date: {entry.date} ({entry.milkType})</span>
              <span>
                {entry.quantity} L @ ₹{entry.rate.toFixed(2)} = <strong className="text-gray-900 font-bold">₹{entry.totalAmount.toFixed(2)}</strong>
              </span>
            </div>
          </div>

          {/* Mandatory Reason */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Reversal Reason (Mandatory) *
            </label>
            <textarea
              rows={3}
              required
              minLength={3}
              placeholder="e.g. Duplicate entry made by operator; customer curdled milk batch discarded"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-xs py-2 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
            />
            <span className="text-[10px] text-gray-500">
              Minimum 3 characters. Stored in immutable audit history.
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition shadow-xs flex items-center gap-1.5"
            >
              {isSubmitting ? 'Reversing Entry...' : 'Confirm Reversal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

