import React from 'react';
import {
  FileSpreadsheet,
  Calculator,
  CheckCircle,
  PlayCircle,
  PauseCircle,
  Trash2,
  Upload,
  Eye,
  History as HistoryIcon,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import type { RateChart } from '../rateChart.types';

interface RateChartTableProps {
  charts: RateChart[];
  isLoading: boolean;
  onActivate: (chart: RateChart) => void;
  onDeactivate: (chart: RateChart) => void;
  onDelete: (chart: RateChart) => void;
  onUploadMatrix: (chart: RateChart) => void;
  onPreview: (chart: RateChart) => void;
  onHistory: (chart: RateChart) => void;
}

export const RateChartTable: React.FC<RateChartTableProps> = ({
  charts,
  isLoading,
  onActivate,
  onDeactivate,
  onDelete,
  onUploadMatrix,
  onPreview,
  onHistory,
}) => {
  if (isLoading) {
    return (
      <div className="py-16 text-center text-xs text-gray-400">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        Loading rate charts...
      </div>
    );
  }

  if (charts.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400 text-xs">
        <FileSpreadsheet className="w-10 h-10 mx-auto text-gray-300 mb-2" />
        <p className="font-semibold text-gray-600">No Rate Charts Found</p>
        <p className="text-[11px] text-gray-400 mt-1">Create your first draft rate chart to begin calculating milk rates.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50/70">
            <th className="py-3 px-4">Chart Name</th>
            <th className="py-3 px-3">Milk Type</th>
            <th className="py-3 px-3">Method</th>
            <th className="py-3 px-3">Status</th>
            <th className="py-3 px-3">Effective Period</th>
            <th className="py-3 px-3">Configuration</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 text-gray-700">
          {charts.map((chart) => {
            const isDraft = chart.status === 'DRAFT';
            const isActive = chart.status === 'ACTIVE';

            const effectiveFromStr = chart.effectiveFrom
              ? new Date(chart.effectiveFrom).toLocaleDateString()
              : '—';
            const effectiveToStr = chart.effectiveTo
              ? new Date(chart.effectiveTo).toLocaleDateString()
              : 'Ongoing (Open-ended)';

            return (
              <tr key={chart.id} className="hover:bg-blue-50/20 transition">
                <td className="py-3 px-4 font-semibold text-[#091e42]">
                  <div className="flex items-center gap-2">
                    {chart.method === 'RATE_TABLE' ? (
                      <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                    ) : (
                      <Calculator className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    <span>{chart.name}</span>
                  </div>
                </td>

                <td className="py-3 px-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      chart.milkType === 'COW'
                        ? 'bg-orange-100 text-orange-800'
                        : chart.milkType === 'BUFFALO'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {chart.milkType}
                  </span>
                </td>

                <td className="py-3 px-3 text-gray-600">
                  {chart.method === 'RATE_TABLE' ? 'Table Matrix' : 'Base Differential'}
                </td>

                <td className="py-3 px-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                      chart.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-800'
                        : chart.status === 'DRAFT'
                        ? 'bg-amber-100 text-amber-800'
                        : chart.status === 'INACTIVE'
                        ? 'bg-gray-100 text-gray-600'
                        : 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {chart.status === 'ACTIVE' && <CheckCircle className="w-3 h-3" />}
                    {chart.status}
                  </span>
                </td>

                <td className="py-3 px-3 font-mono text-[11px] text-gray-600">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-gray-400" />
                    <span>{effectiveFromStr} – {effectiveToStr}</span>
                  </div>
                </td>

                <td className="py-3 px-3 text-[11px] text-gray-500">
                  {chart.method === 'RATE_TABLE' ? (
                    <span>
                      {chart.totalCells != null && chart.totalCells > 0 ? (
                        <strong className="text-gray-800 font-semibold">{chart.totalCells} cells loaded</strong>
                      ) : (
                        <span className="text-amber-600 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> No cells (Upload required)
                        </span>
                      )}
                    </span>
                  ) : chart.differential ? (
                    <span>
                      Base ₹<strong>{chart.differential.baseRate}</strong> ({chart.differential.baseFat}%F / {chart.differential.baseSnf}%S)
                    </span>
                  ) : (
                    '—'
                  )}
                </td>

                <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                  {/* Test preview */}
                  <button
                    onClick={() => onPreview(chart)}
                    title="Preview Rate Calculation"
                    className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 inline" />
                  </button>

                  {/* Version history */}
                  <button
                    onClick={() => onHistory(chart)}
                    title="View History"
                    className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition cursor-pointer"
                  >
                    <HistoryIcon className="w-3.5 h-3.5 inline" />
                  </button>

                  {/* Excel Upload (only if DRAFT and RATE_TABLE) */}
                  {isDraft && chart.method === 'RATE_TABLE' && (
                    <button
                      onClick={() => onUploadMatrix(chart)}
                      title="Upload Excel Rate Matrix"
                      className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 inline" />
                    </button>
                  )}

                  {/* Activate (if DRAFT) */}
                  {isDraft && (
                    <button
                      onClick={() => onActivate(chart)}
                      title="Activate Rate Chart"
                      className="px-2 py-1 text-[11px] font-bold bg-green-600 hover:bg-green-700 text-white rounded-lg transition cursor-pointer shadow-xs inline-flex items-center gap-1"
                    >
                      <PlayCircle className="w-3 h-3" /> Activate
                    </button>
                  )}

                  {/* Deactivate (if ACTIVE) */}
                  {isActive && (
                    <button
                      onClick={() => onDeactivate(chart)}
                      title="Deactivate Rate Chart"
                      className="px-2 py-1 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition cursor-pointer shadow-xs inline-flex items-center gap-1"
                    >
                      <PauseCircle className="w-3 h-3" /> Deactivate
                    </button>
                  )}

                  {/* Delete (if DRAFT) */}
                  {isDraft && (
                    <button
                      onClick={() => onDelete(chart)}
                      title="Delete Draft Chart"
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 inline" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

