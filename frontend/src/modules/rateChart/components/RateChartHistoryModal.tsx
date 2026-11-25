import React from 'react';
import { X, History as HistoryIcon, Clock, Loader2 } from 'lucide-react';
import { useRateChartHistoryQuery } from '../rateChart.queries';

interface RateChartHistoryModalProps {
  isOpen: boolean;
  chartId: string;
  chartName: string;
  onClose: () => void;
}

export const RateChartHistoryModal: React.FC<RateChartHistoryModalProps> = ({
  isOpen,
  chartId,
  chartName,
  onClose,
}) => {
  const { data, isLoading, error } = useRateChartHistoryQuery(isOpen ? chartId : undefined);
  const historyItems = data?.history || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-[#091e42] text-white">
          <div className="flex items-center gap-2">
            <HistoryIcon className="w-5 h-5 text-blue-300" />
            <div>
              <h3 className="font-bold text-sm tracking-wide">Rate Chart History</h3>
              <p className="text-[11px] text-blue-200">{chartName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-gray-700">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-[#0052cc]" />
              <span>Loading version history...</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs">
              Failed to load history: {(error as any)?.message}
            </div>
          )}

          {!isLoading && (!historyItems || historyItems.length === 0) && (
            <div className="py-8 text-center text-gray-400 text-xs">
              No historical changes recorded for this rate chart.
            </div>
          )}

          {!isLoading && historyItems && historyItems.length > 0 && (
            <div className="space-y-3">
              {historyItems.map((item: any, idx: number) => (
                <div key={item.id || idx} className="p-3.5 border border-gray-200 rounded-xl bg-gray-50/50 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-900 text-xs">{item.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-800'
                            : item.status === 'DRAFT'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-600 flex items-center justify-between">
                    <span>
                      Method: <strong>{item.method === 'RATE_TABLE' ? 'FAT/SNF Table' : 'Base + Differential'}</strong>
                    </span>
                    <span className="font-mono text-[10px]">
                      {new Date(item.effectiveFrom).toLocaleDateString()} –{' '}
                      {item.effectiveTo ? new Date(item.effectiveTo).toLocaleDateString() : 'Ongoing'}
                    </span>
                  </div>
                </div>
              ))}
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
