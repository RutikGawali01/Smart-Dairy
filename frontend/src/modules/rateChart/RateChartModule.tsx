import React, { useState } from 'react';
import {
  Plus,
  Download,
  Search,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { useRateChartsQuery, useRateChartMutations } from './rateChart.queries';
import { rateChartApi } from './rateChart.api';
import { RateChartTable } from './components/RateChartTable';
import { CreateRateChartModal } from './components/CreateRateChartModal';
import { ExcelMatrixImportModal } from './components/ExcelMatrixImportModal';
import { ActivationConflictModal } from './components/ActivationConflictModal';
import { RatePreviewModal } from './components/RatePreviewModal';
import { RateChartHistoryModal } from './components/RateChartHistoryModal';
import type {
  RateChart,
  MilkType,
  RateCalculationMethod,
  RateChartStatus,
  ActivationConflict,
} from './rateChart.types';

export const RateChartModule: React.FC = () => {
  // Query Filter States
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMilkType, setFilterMilkType] = useState<MilkType | ''>('');
  const [filterMethod, setFilterMethod] = useState<RateCalculationMethod | ''>('');
  const [filterStatus, setFilterStatus] = useState<RateChartStatus | ''>('');

  // Modals States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [importTargetChart, setImportTargetChart] = useState<RateChart | null>(null);
  const [previewTargetChart, setPreviewTargetChart] = useState<RateChart | null>(null);
  const [historyTargetChart, setHistoryTargetChart] = useState<RateChart | null>(null);

  // Activation Conflict State (HTTP 409)
  const [conflictModalData, setConflictModalData] = useState<{
    isOpen: boolean;
    chartId: string;
    chartName: string;
    conflicts: ActivationConflict[];
  }>({
    isOpen: false,
    chartId: '',
    chartName: '',
    conflicts: [],
  });

  // Alerts
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Queries & Mutations
  const { data, isLoading, isError, error: queryError, refetch } = useRateChartsQuery({
    page,
    limit: 10,
    search: searchTerm || undefined,
    milkType: filterMilkType || undefined,
    method: filterMethod || undefined,
    status: filterStatus || undefined,
  });

  const { activateChart, deactivateChart, deleteChart } = useRateChartMutations();

  // Handlers
  const handleActivate = async (chart: RateChart) => {
    setFeedbackMsg(null);
    try {
      await activateChart.mutateAsync({ id: chart.id, confirmReplace: false });
      setFeedbackMsg({ type: 'success', text: `Rate chart "${chart.name}" activated successfully!` });
      refetch();
    } catch (err: any) {
      if (err.statusCode === 409 || err.status === 409) {
        // Show conflict resolution modal
        const rawConflicts = err.errors || err.data?.conflicts || [];
        const mappedConflicts: ActivationConflict[] =
          rawConflicts.length > 0
            ? rawConflicts.map((c: any) => ({
                chartId: c.id || c.chartId || 'conflict',
                name: c.name || 'Existing Active Chart',
                effectiveFrom: c.effectiveFrom || chart.effectiveFrom,
                effectiveTo: c.effectiveTo ?? null,
                message: c.message,
              }))
            : [
                {
                  chartId: 'conflict',
                  name: 'Existing Active Chart',
                  effectiveFrom: chart.effectiveFrom,
                  effectiveTo: null,
                  message: err.message,
                },
              ];

        setConflictModalData({
          isOpen: true,
          chartId: chart.id,
          chartName: chart.name,
          conflicts: mappedConflicts,
        });
      } else {
        setFeedbackMsg({ type: 'error', text: err.message || 'Failed to activate chart.' });
      }
    }
  };

  const handleConfirmReplace = async (chartId: string) => {
    try {
      await activateChart.mutateAsync({ id: chartId, confirmReplace: true });
      setConflictModalData({ isOpen: false, chartId: '', chartName: '', conflicts: [] });
      setFeedbackMsg({
        type: 'success',
        text: 'Previous active chart shortened and new chart activated successfully!',
      });
      refetch();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Replacement activation failed.' });
    }
  };

  const handleDeactivate = async (chart: RateChart) => {
    if (!confirm(`Are you sure you want to deactivate "${chart.name}"?`)) return;
    setFeedbackMsg(null);
    try {
      await deactivateChart.mutateAsync(chart.id);
      setFeedbackMsg({ type: 'success', text: `Chart "${chart.name}" deactivated.` });
      refetch();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to deactivate chart.' });
    }
  };

  const handleDelete = async (chart: RateChart) => {
    if (!confirm(`Are you sure you want to permanently delete draft chart "${chart.name}"?`)) return;
    setFeedbackMsg(null);
    try {
      await deleteChart.mutateAsync(chart.id);
      setFeedbackMsg({ type: 'success', text: 'Draft chart deleted.' });
      refetch();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Cannot delete rate chart.' });
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await rateChartApi.downloadTemplate();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to download Excel template.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-black text-[#091e42] tracking-tight">Rate Chart Management</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure dynamic Base Differential formulas, import Excel Matrix tables, and manage effective dates.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
            title="Download blank Excel Matrix Template"
          >
            <Download className="w-4 h-4 text-gray-600" />
            <span className="hidden sm:inline">Excel Template</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2 bg-[#0052cc] hover:bg-[#0747a6] text-white text-xs font-bold rounded-xl transition shadow-md cursor-pointer flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create Rate Chart</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            feedbackMsg.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="font-bold hover:opacity-75 cursor-pointer ml-3 text-sm"
          >
            ×
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative sm:col-span-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by chart name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full light-input rounded-lg text-xs py-2 pl-9 pr-3"
            />
          </div>

          {/* Milk Type Filter */}
          <div>
            <select
              value={filterMilkType}
              onChange={(e) => setFilterMilkType(e.target.value as any)}
              className="w-full light-input rounded-lg text-xs py-2 px-3 bg-white"
            >
              <option value="">All Milk Types</option>
              <option value="COW">COW</option>
              <option value="BUFFALO">BUFFALO</option>
              <option value="MIX">MIX</option>
            </select>
          </div>

          {/* Method Filter */}
          <div>
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value as any)}
              className="w-full light-input rounded-lg text-xs py-2 px-3 bg-white"
            >
              <option value="">All Calculation Methods</option>
              <option value="BASE_DIFFERENTIAL">Base Differential</option>
              <option value="RATE_TABLE">Table Matrix (Excel)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full light-input rounded-lg text-xs py-2 px-3 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="DRAFT">DRAFT</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>
        </div>
      </div>

      {/* Query Error Banner */}
      {isError && (
        <div className="p-3.5 rounded-xl border bg-red-50 border-red-200 text-red-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>Failed to load rate charts: {(queryError as any)?.message || 'Unknown error'}</span>
          </div>
          <button
            onClick={() => refetch()}
            className="px-2.5 py-1 bg-white border border-red-200 rounded-lg font-bold hover:bg-red-100 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <RateChartTable
          charts={data?.charts || (data as any)?.items || []}
          isLoading={isLoading}
          onActivate={handleActivate}
          onDeactivate={handleDeactivate}
          onDelete={handleDelete}
          onUploadMatrix={(chart) => setImportTargetChart(chart)}
          onPreview={(chart) => setPreviewTargetChart(chart)}
          onHistory={(chart) => setHistoryTargetChart(chart)}
        />

        {/* Pagination Bar */}
        {data?.pagination && data.pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 bg-gray-50/50">
            <span>
              Showing Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 font-medium cursor-pointer"
              >
                Previous
              </button>
              <button
                disabled={page >= data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 font-medium cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateRateChartModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={(createdChart, matrixImported) => {
          refetch();
          if (matrixImported && createdChart) {
            setFeedbackMsg({
              type: 'success',
              text: `Draft "${createdChart.name}" saved with Excel rate matrix. Preview rates or Activate when ready.`,
            });
          } else if (createdChart && createdChart.method === 'RATE_TABLE') {
            setImportTargetChart(createdChart);
            setFeedbackMsg({
              type: 'success',
              text: `Draft "${createdChart.name}" created. Upload and validate your Excel matrix to continue.`,
            });
          } else {
            setFeedbackMsg({ type: 'success', text: 'New draft rate chart created.' });
          }
        }}
      />

      {importTargetChart && (
        <ExcelMatrixImportModal
          isOpen={!!importTargetChart}
          chartId={importTargetChart.id}
          chartName={importTargetChart.name}
          onClose={() => setImportTargetChart(null)}
          onSuccess={() => {
            refetch();
            setFeedbackMsg({ type: 'success', text: 'Excel Rate Matrix imported successfully.' });
          }}
        />
      )}

      {conflictModalData.isOpen && (
        <ActivationConflictModal
          isOpen={conflictModalData.isOpen}
          chartId={conflictModalData.chartId}
          chartName={conflictModalData.chartName}
          conflicts={conflictModalData.conflicts}
          onClose={() => setConflictModalData({ isOpen: false, chartId: '', chartName: '', conflicts: [] })}
          onConfirmReplace={handleConfirmReplace}
          isLoading={activateChart.isPending}
        />
      )}

      {previewTargetChart && (
        <RatePreviewModal
          isOpen={!!previewTargetChart}
          chart={previewTargetChart}
          onClose={() => setPreviewTargetChart(null)}
        />
      )}

      {historyTargetChart && (
        <RateChartHistoryModal
          isOpen={!!historyTargetChart}
          chartId={historyTargetChart.id}
          chartName={historyTargetChart.name}
          onClose={() => setHistoryTargetChart(null)}
        />
      )}
    </div>
  );
};
export default RateChartModule;
