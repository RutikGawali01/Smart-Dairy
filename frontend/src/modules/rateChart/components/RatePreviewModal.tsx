import React, { useState } from 'react';
import { X, Calculator, AlertTriangle, Loader2 } from 'lucide-react';
import { rateChartApi } from '../rateChart.api';
import type { RateChart, CalculateRateResult } from '../rateChart.types';

interface RatePreviewModalProps {
  isOpen: boolean;
  chart: RateChart | null;
  onClose: () => void;
}

export const RatePreviewModal: React.FC<RatePreviewModalProps> = ({ isOpen, chart, onClose }) => {
  const [fat, setFat] = useState('4.0');
  const [snf, setSnf] = useState('8.5');
  const [qty, setQty] = useState('10');
  const [result, setResult] = useState<CalculateRateResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !chart) return null;

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const res = await rateChartApi.previewChartRate(chart.id, {
        fat: Number(fat),
        snf: Number(snf),
        quantity: Number(qty),
      });
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Calculation preview failed');
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-[#091e42] text-white">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-blue-300" />
            <div>
              <h3 className="font-bold text-sm tracking-wide">Rate Calculator Preview</h3>
              <p className="text-[11px] text-blue-200">{chart.name} ({chart.milkType})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-gray-700">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleCalculate} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">FAT (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  className="w-full light-input rounded-lg text-xs py-1.5 px-2 text-center"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">SNF (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={snf}
                  onChange={(e) => setSnf(e.target.value)}
                  className="w-full light-input rounded-lg text-xs py-1.5 px-2 text-center"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Quantity (L)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full light-input rounded-lg text-xs py-1.5 px-2 text-center"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#0052cc] hover:bg-[#0747a6] disabled:bg-blue-300 text-white font-bold text-xs py-2 rounded-lg transition shadow cursor-pointer flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Calculate Test Rate'}
            </button>
          </form>

          {/* Results Display */}
          {result && (
            <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
              <div className="flex justify-between items-center border-b border-blue-200/80 pb-2">
                <span className="text-xs text-gray-600 font-semibold">Applied Rate:</span>
                <span className="text-xl font-black text-[#0052cc]">₹{result.rate} <span className="text-xs font-normal text-gray-500">/ Litre</span></span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-600 font-medium">Total Payout ({result.quantity} L):</span>
                <span className="text-base font-extrabold text-[#091e42]">₹{result.totalAmount}</span>
              </div>

              {result.details?.formulaDescription && (
                <div className="pt-2 border-t border-blue-200/60 text-[11px] text-gray-600 space-y-1">
                  <span className="font-semibold text-gray-700 block">Calculation Details:</span>
                  <p className="bg-white p-2 rounded-lg border border-blue-100 font-mono text-[10px]">
                    {result.details.formulaDescription}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
