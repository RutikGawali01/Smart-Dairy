import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  X,
  AlertTriangle,
  FileSpreadsheet,
  Calculator,
  Download,
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { createRateChartFormSchema } from '../rateChart.schemas';
import { DifferentialConfigForm } from './DifferentialConfigForm';
import { MatrixGridPreview } from './MatrixGridPreview';
import { useRateChartMutations } from '../rateChart.queries';
import { rateChartApi } from '../rateChart.api';
import type {
  MilkType,
  RateCalculationMethod,
  RateChart,
  ExcelValidateResponse,
} from '../rateChart.types';

interface CreateRateChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (chart?: RateChart, matrixImported?: boolean) => void;
}

export const CreateRateChartModal: React.FC<CreateRateChartModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<RateCalculationMethod>('BASE_DIFFERENTIAL');
  const [serverError, setServerError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Inline Table Matrix (Excel) workflow state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [draftChart, setDraftChart] = useState<RateChart | null>(null);
  const [validationResult, setValidationResult] = useState<ExcelValidateResponse | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  const { createChart, validateExcelMatrix, confirmExcelMatrix } = useRateChartMutations();

  const todayStr = new Date().toISOString().split('T')[0];

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createRateChartFormSchema),
    defaultValues: {
      name: '',
      milkType: 'COW' as MilkType,
      method: 'BASE_DIFFERENTIAL' as RateCalculationMethod,
      effectiveFrom: todayStr,
      effectiveTo: '',
      differential: {
        baseFat: 3.5,
        baseSnf: 8.5,
        baseRate: 35.0,
        fatDifferential: 0.4,
        snfDifferential: 0.3,
        differentialUnit: 0.1,
        minFat: 3.0,
        maxFat: 6.0,
        minSnf: 8.0,
        maxSnf: 9.5,
      },
    },
  });

  if (!isOpen) return null;

  const resetAllState = () => {
    reset();
    setSelectedMethod('BASE_DIFFERENTIAL');
    setServerError(null);
    setValidationErrors([]);
    setSelectedFile(null);
    setDraftChart(null);
    setValidationResult(null);
  };

  const handleClose = () => {
    resetAllState();
    onClose();
  };

  const handleMethodChange = (method: RateCalculationMethod) => {
    setSelectedMethod(method);
    setValue('method', method);
    setServerError(null);
    setValidationErrors([]);
  };

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    setServerError(null);
    try {
      await rateChartApi.downloadTemplate();
    } catch (err: any) {
      setServerError(err.message || 'Failed to download Excel template.');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setValidationResult(null);
      setValidationErrors([]);
      setServerError(null);
    }
  };

  const onSubmit = async (data: any) => {
    setServerError(null);
    setValidationErrors([]);
    try {
      // Reuse existing draft chart if user is re-uploading after a validation error
      let chart = draftChart;
      if (!chart) {
        const effectiveFromIso = new Date(`${data.effectiveFrom}T00:00:00.000Z`).toISOString();
        const effectiveToIso = data.effectiveTo
          ? new Date(`${data.effectiveTo}T23:59:59.999Z`).toISOString()
          : null;

        const payload: any = {
          name: data.name.trim(),
          milkType: data.milkType,
          method: data.method,
          effectiveFrom: effectiveFromIso,
          effectiveTo: effectiveToIso,
        };

        if (data.method === 'BASE_DIFFERENTIAL') {
          payload.differential = {
            baseFat: Number(data.differential.baseFat),
            baseSnf: Number(data.differential.baseSnf),
            baseRate: Number(data.differential.baseRate),
            fatDifferential: Number(data.differential.fatDifferential),
            snfDifferential: Number(data.differential.snfDifferential),
            differentialUnit: Number(data.differential.differentialUnit || 0.1),
            minFat: data.differential.minFat ? Number(data.differential.minFat) : null,
            maxFat: data.differential.maxFat ? Number(data.differential.maxFat) : null,
            minSnf: data.differential.minSnf ? Number(data.differential.minSnf) : null,
            maxSnf: data.differential.maxSnf ? Number(data.differential.maxSnf) : null,
            minRate: data.differential.minRate ? Number(data.differential.minRate) : null,
            maxRate: data.differential.maxRate ? Number(data.differential.maxRate) : null,
          };
        }

        chart = await createChart.mutateAsync(payload);
        setDraftChart(chart);
      }

      // If RATE_TABLE and an Excel file was selected, immediately parse & validate every cell
      if (data.method === 'RATE_TABLE' && selectedFile && chart) {
        const res = await validateExcelMatrix.mutateAsync({
          id: chart.id,
          file: selectedFile,
        });

        if (!res.isValid) {
          setValidationErrors(
            res.errors && res.errors.length > 0
              ? res.errors
              : [res.message || 'Excel matrix validation failed. Please correct the errors and re-upload.']
          );
          setValidationResult(null);
          return;
        }

        setValidationResult(res);
        return;
      }

      // Otherwise (BASE_DIFFERENTIAL or empty RATE_TABLE draft), finish
      const finishedChart = chart;
      resetAllState();
      onClose();
      if (onSuccess) onSuccess(finishedChart, false);
    } catch (err: any) {
      setServerError(err.message || 'Failed to create rate chart');
    }
  };

  const handleConfirmImport = async () => {
    if (!draftChart || !validationResult?.importToken) return;
    setServerError(null);
    try {
      await confirmExcelMatrix.mutateAsync({
        id: draftChart.id,
        importToken: validationResult.importToken,
      });
      const finishedChart = draftChart;
      resetAllState();
      onClose();
      if (onSuccess) onSuccess(finishedChart, true);
    } catch (err: any) {
      setServerError(err.message || 'Failed to save Excel matrix to draft chart.');
    }
  };

  const isBusy =
    isSubmitting ||
    createChart.isPending ||
    validateExcelMatrix.isPending ||
    confirmExcelMatrix.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col max-h-[92vh] ${
          validationResult ? 'max-w-5xl' : 'max-w-3xl'
        }`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-[#091e42] text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg tracking-tight">
                {validationResult ? 'Review & Confirm Excel Import' : 'Create New Rate Chart'}
              </h3>
              <p className="text-xs text-blue-200">
                {validationResult
                  ? 'Verify the rate matrix below before saving it to your draft chart'
                  : 'Set milk type, calculation method, and effective dates'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step 2: Inline Excel Import Preview (when validated) */}
        {validationResult ? (
          <div className="p-6 overflow-y-auto space-y-4 text-gray-700">
            {serverError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            <div className="p-3.5 bg-green-50 border border-green-200 rounded-xl text-green-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                <span className="font-semibold">
                  Excel matrix validated for draft &ldquo;{draftChart?.name}&rdquo;!
                </span>
              </div>
              {validationResult.importToken && (
                <span className="text-[11px] text-green-700 font-mono">
                  Token: {validationResult.importToken.slice(0, 8)}...
                </span>
              )}
            </div>

            {/* Complete 2D Rate Matrix Preview */}
            <MatrixGridPreview
              cells={validationResult.cells || validationResult.sampleCells || []}
              fatSteps={validationResult.fatSteps}
              snfSteps={validationResult.snfSteps}
              milkType={draftChart?.milkType}
              chartName={draftChart?.name}
            />

            {/* Warnings */}
            {validationResult.warnings && validationResult.warnings.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Import Notices ({validationResult.warnings.length})</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                  {validationResult.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setValidationResult(null)}
                className="text-sm font-bold text-gray-700 hover:text-gray-900 underline cursor-pointer"
              >
                Upload Different File
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={confirmExcelMatrix.isPending}
                  onClick={handleConfirmImport}
                  className="px-5 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-xl transition shadow-md cursor-pointer flex items-center gap-2"
                >
                  {confirmExcelMatrix.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving Matrix...
                    </>
                  ) : (
                    'Confirm & Save Matrix to Draft'
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Step 1: Chart Details & Configuration / Excel Upload */
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 overflow-y-auto space-y-5">
            {serverError && (
              <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-sm font-medium rounded-xl flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
                <span>{serverError}</span>
              </div>
            )}

            {/* Validation Errors from Excel Upload */}
            {validationErrors.length > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl space-y-2">
                <div className="font-bold flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
                  <span>Excel Matrix Validation Errors ({validationErrors.length})</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-xs max-h-32 overflow-y-auto">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
                <p className="text-xs text-red-700 font-semibold pt-1">
                  Please fix the highlighted issues in your Excel file and upload again.
                </p>
              </div>
            )}

            {/* Chart Name & Milk Type */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-gray-800 mb-1.5">
                  Chart Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Standard Cow Spring 2026"
                  {...register('name')}
                  disabled={!!draftChart}
                  className="w-full light-input rounded-xl text-sm py-2.5 px-3.5 disabled:bg-gray-100"
                />
                {errors.name && (
                  <p className="text-xs font-medium text-red-600 mt-1">{errors.name.message as string}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1.5">
                  Milk Type <span className="text-red-500">*</span>
                </label>
                <select
                  {...register('milkType')}
                  disabled={!!draftChart}
                  className="w-full light-input rounded-xl text-sm font-semibold py-2.5 px-3.5 bg-white disabled:bg-gray-100"
                >
                  <option value="COW">COW</option>
                  <option value="BUFFALO">BUFFALO</option>
                  <option value="MIX">MIX</option>
                </select>
              </div>
            </div>

            {/* Method Selection Cards */}
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">
                Calculation Method <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div
                  onClick={() => !draftChart && handleMethodChange('BASE_DIFFERENTIAL')}
                  className={`p-4 rounded-xl border-2 transition flex items-start gap-3 ${
                    draftChart ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                  } ${
                    selectedMethod === 'BASE_DIFFERENTIAL'
                      ? 'border-[#0052cc] bg-blue-50/50 text-[#0052cc] shadow-2xs'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <Calculator className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-sm block">Base + Differential</span>
                    <span className="text-xs text-gray-600 block mt-1 leading-relaxed">
                      Calculated dynamically from Base FAT/SNF standards and step increments.
                    </span>
                  </div>
                </div>

                <div
                  onClick={() => !draftChart && handleMethodChange('RATE_TABLE')}
                  className={`p-4 rounded-xl border-2 transition flex items-start gap-3 ${
                    draftChart ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                  } ${
                    selectedMethod === 'RATE_TABLE'
                      ? 'border-[#0052cc] bg-blue-50/50 text-[#0052cc] shadow-2xs'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <FileSpreadsheet className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-sm block">FAT/SNF Table Matrix</span>
                    <span className="text-xs text-gray-600 block mt-1 leading-relaxed">
                      Download Excel template, fill FAT × SNF rates, and upload spreadsheet.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Effective Date Range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1.5">
                  Effective From <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  {...register('effectiveFrom')}
                  disabled={!!draftChart}
                  className="w-full light-input rounded-xl text-sm py-2.5 px-3.5 disabled:bg-gray-100"
                />
                {errors.effectiveFrom && (
                  <p className="text-xs font-medium text-red-600 mt-1">{errors.effectiveFrom.message as string}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1.5">
                  Effective To <span className="text-gray-500 font-normal text-xs">(Optional / Open-ended)</span>
                </label>
                <input
                  type="date"
                  {...register('effectiveTo')}
                  disabled={!!draftChart}
                  className="w-full light-input rounded-xl text-sm py-2.5 px-3.5 disabled:bg-gray-100"
                />
                {errors.effectiveTo && (
                  <p className="text-xs font-medium text-red-600 mt-1">{errors.effectiveTo.message as string}</p>
                )}
              </div>
            </div>

            {/* Conditional Method Form */}
            {selectedMethod === 'BASE_DIFFERENTIAL' ? (
              <DifferentialConfigForm register={register} errors={errors} />
            ) : (
              <div className="space-y-3.5">
                {/* Step 1 Guidance + Download Template */}
                <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl text-sm text-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold">
                      <FileSpreadsheet className="w-5 h-5 text-[#0052cc] shrink-0" />
                      <span>Download Provided Table Matrix Template</span>
                    </div>
                    <p className="text-xs text-blue-800 leading-relaxed">
                      Download the Excel template, fill in your FAT/SNF rate values, and upload the completed file below.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    disabled={isDownloadingTemplate}
                    className="px-4 py-2.5 bg-white hover:bg-blue-50 text-[#0052cc] border border-blue-300 text-sm font-bold rounded-xl transition shadow-2xs cursor-pointer flex items-center gap-2 shrink-0"
                  >
                    {isDownloadingTemplate ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>Download Template</span>
                  </button>
                </div>

                {/* Step 2 Upload Excel File */}
                <div className="p-6 border-2 border-dashed border-gray-300 rounded-xl text-center bg-gray-50/60 hover:bg-gray-50 transition flex flex-col items-center justify-center">
                  <Upload className="w-8 h-8 text-[#0052cc] mb-2" />
                  <p className="text-sm font-bold text-gray-800">Upload Completed Excel Rate Matrix</p>
                  <p className="text-xs text-gray-500 mt-1 mb-3.5">
                    Accepts .xlsx, .xls, or .csv matrix grids
                  </p>
                  <label className="px-5 py-2 bg-[#0052cc] hover:bg-[#0747a6] text-white text-sm font-bold rounded-xl cursor-pointer transition shadow-xs">
                    Choose Excel File
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                  {selectedFile && (
                    <p className="mt-3 text-sm font-semibold text-green-700 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>
                        {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isBusy}
                className="px-6 py-2.5 text-sm font-bold bg-[#0052cc] hover:bg-[#0747a6] disabled:bg-blue-300 text-white rounded-xl transition shadow-md cursor-pointer flex items-center gap-2"
              >
                {isBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {validateExcelMatrix.isPending
                        ? 'Parsing & Validating...'
                        : 'Saving Draft...'}
                    </span>
                  </>
                ) : selectedMethod === 'RATE_TABLE' && selectedFile ? (
                  'Upload & Validate Excel'
                ) : (
                  'Create Draft Chart'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
