import React from 'react';
import { X, Table2, AlertTriangle, Loader2, FileSpreadsheet } from 'lucide-react';
import { useRateChartDetailQuery } from '../rateChart.queries';
import { MatrixGridPreview } from './MatrixGridPreview';
import type { RateChart } from '../rateChart.types';

interface RatePreviewModalProps {
  isOpen: boolean;
  chart: RateChart | null;
  onClose: () => void;
}

export const RatePreviewModal: React.FC<RatePreviewModalProps> = ({ isOpen, chart, onClose }) => {
  const { data: detail, isLoading, error } = useRateChartDetailQuery(isOpen ? chart?.id : undefined);

  if (!isOpen || !chart) return null;

  const cells = detail?.cells || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-[#091e42] text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Table2 className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg tracking-tight">Rate Chart Matrix Preview</h3>
              <p className="text-xs text-blue-200">
                {chart.name} · {chart.milkType} ·{' '}
                {chart.method === 'RATE_TABLE' ? 'FAT/SNF Table' : 'Base + Differential'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {isLoading && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-500 text-sm">
              <Loader2 className="w-8 h-8 animate-spin text-[#0052cc]" />
              <span className="font-semibold">Loading complete rate chart matrix...</span>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
              <span>{(error as any)?.message || 'Failed to load rate chart matrix.'}</span>
            </div>
          )}

          {!isLoading && !error && cells.length === 0 && (
            <div className="py-14 text-center text-gray-500 space-y-2 border border-dashed border-gray-300 rounded-xl bg-gray-50/50">
              <FileSpreadsheet className="w-10 h-10 mx-auto text-gray-300" />
              <p className="text-base font-bold text-gray-700">No Rate Matrix Available</p>
              <p className="text-sm text-gray-500">
                {chart.method === 'RATE_TABLE'
                  ? 'No Excel rate cells have been uploaded to this draft chart yet.'
                  : 'Differential configuration is missing for this chart.'}
              </p>
            </div>
          )}

          {!isLoading && !error && cells.length > 0 && (
            <MatrixGridPreview
              cells={cells}
              milkType={chart.milkType}
              chartName={chart.name}
            />
          )}

          <div className="pt-2 flex justify-end border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
