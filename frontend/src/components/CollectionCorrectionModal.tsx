import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Calculator, History } from 'lucide-react';
import type { MilkEntry } from '../store/collection/useMilkCollectionStore';
import { useMilkCollectionStore } from '../store/collection/useMilkCollectionStore';
import { useLiveRateCalculator } from '../modules/rateChart/hooks/useLiveRateCalculator';
import type { MilkType } from '../modules/rateChart/rateChart.types';

interface CollectionCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: MilkEntry | null;
  onSuccess?: () => void;
}

export const CollectionCorrectionModal: React.FC<CollectionCorrectionModalProps> = ({
  isOpen,
  onClose,
  entry,
  onSuccess,
}) => {
  const { correctCollectionEntry } = useMilkCollectionStore();

  const [quantity, setQuantity] = useState('');
  const [fat, setFat] = useState('');
  const [snf, setSnf] = useState('');
  const [milkType, setMilkType] = useState<MilkType>('COW');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      setQuantity(entry.quantity.toString());
      setFat(entry.fat.toString());
      setSnf(entry.snf.toString());
      setMilkType(entry.milkType);
      setReason('');
      setErrorMsg(null);
    }
  }, [entry, isOpen]);

  // Live recalculation based on edited values
  const {
    rate: liveRate,
    totalAmount: liveTotal,
    chartName,
    method,
    formulaDescription,
    isLoading: isCalculating,
    isUnavailable,
  } = useLiveRateCalculator({
    milkType,
    fat,
    snf,
    quantity,
    collectionDate: entry?.date,
  });

  if (!isOpen || !entry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 3) {
      setErrorMsg('A valid correction reason of at least 3 characters is mandatory.');
      return;
    }

    const numQty = parseFloat(quantity);
    const numFat = parseFloat(fat);
    const numSnf = parseFloat(snf);

    if (isNaN(numQty) || numQty <= 0) {
      setErrorMsg('Quantity must be greater than 0.');
      return;
    }
    if (isNaN(numFat) || numFat <= 0) {
      setErrorMsg('FAT must be greater than 0.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const ok = await correctCollectionEntry(entry.id, {
        quantity: numQty,
        fat: numFat,
        snf: isNaN(numSnf) ? undefined : numSnf,
        milkType,
        reason: reason.trim(),
      });

      if (ok) {
        onSuccess?.();
        onClose();
      } else {
        const storeError = useMilkCollectionStore.getState().error;
        setErrorMsg(storeError || 'Failed to correct milk entry.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Correction failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-amber-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Correct Milk Collection Entry</h2>
              <p className="text-xs text-gray-500">
                Audited modification with authoritative backend recalculation
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Original Entry Baseline Box */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-600 space-y-1.5">
            <div className="flex justify-between font-semibold text-gray-900">
              <span>Customer: #{entry.customerCode} — {entry.customerName}</span>
              <span className="text-amber-700 font-bold">{entry.shift} Shift</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-200/60 text-[11px]">
              <div>Date: <span className="font-medium text-gray-800">{entry.date}</span></div>
              <div>Milk Type: <span className="font-medium text-gray-800">{entry.milkType}</span></div>
              <div>Qty: <span className="font-medium text-gray-800">{entry.quantity} L</span></div>
              <div>FAT: <span className="font-medium text-gray-800">{entry.fat}%</span></div>
              <div>SNF: <span className="font-medium text-gray-800">{entry.snf}%</span></div>
              <div>Amount: <span className="font-bold text-[#091e42]">₹{entry.totalAmount.toFixed(2)}</span></div>
            </div>
          </div>

          {/* Editable Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Milk Type
              </label>
              <select
                value={milkType}
                onChange={(e) => setMilkType(e.target.value as MilkType)}
                className="w-full text-xs py-2 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="COW">COW</option>
                <option value="BUFFALO">BUFFALO</option>
                <option value="MIX">MIX</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Quantity (Litres) *
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full text-xs py-2 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                FAT (%) *
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                required
                value={fat}
                onChange={(e) => setFat(e.target.value)}
                className="w-full text-xs py-2 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                SNF (%) *
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={snf}
                onChange={(e) => setSnf(e.target.value)}
                className="w-full text-xs py-2 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>

          {/* Live Recalculation Preview */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-blue-600" />
                Recalculated Authoritative Payout:
              </span>
              {isCalculating ? (
                <span className="text-[11px] text-blue-600 animate-pulse">Calculating...</span>
              ) : isUnavailable ? (
                <span className="text-[11px] text-amber-700 font-bold">No active chart found</span>
              ) : (
                <span className="text-xs font-bold text-blue-700">
                  {chartName} ({method})
                </span>
              )}
            </div>

            <div className="flex items-baseline justify-between pt-1 border-t border-blue-100">
              <span className="text-xs text-gray-600">
                Rate: <strong className="text-blue-900 font-mono">₹{liveRate}/L</strong>
              </span>
              <span className="text-base font-black text-blue-950 font-mono">
                Total: ₹{liveTotal}
              </span>
            </div>
            {formulaDescription && (
              <p className="text-[10px] text-blue-700 font-mono italic">{formulaDescription}</p>
            )}
          </div>

          {/* Mandatory Correction Reason */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Correction Reason (Mandatory Audit Requirement) *
            </label>
            <textarea
              rows={2}
              required
              minLength={3}
              placeholder="e.g. Corrected FAT test reading from lab slip, sample re-tested"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-xs py-2 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-[10px] text-gray-500">
              Minimum 3 characters. Stored in immutable audit history.
            </span>
          </div>

          {/* Footer Actions */}
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
              disabled={isSubmitting || isUnavailable}
              className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition shadow-xs flex items-center gap-1.5"
            >
              {isSubmitting ? 'Saving Correction...' : 'Confirm Correction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
