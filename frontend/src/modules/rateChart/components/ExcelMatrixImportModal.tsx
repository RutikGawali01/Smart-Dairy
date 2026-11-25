import React, { useState } from 'react';
import { X, FileSpreadsheet, CheckCircle, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';
import { useRateChartMutations } from '../rateChart.queries';
import type { ExcelValidateResponse } from '../rateChart.types';

interface ExcelMatrixImportModalProps {
  isOpen: boolean;
  chartId: string;
  chartName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ExcelMatrixImportModal: React.FC<ExcelMatrixImportModalProps> = ({
  isOpen,
  chartId,
  chartName,
  onClose,
  onSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<ExcelValidateResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { validateExcelMatrix, confirmExcelMatrix } = useRateChartMutations();

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setValidationResult(null);
      setErrorMsg(null);
    }
  };

  const handleValidate = async () => {
    if (!selectedFile) return;
    setErrorMsg(null);
    try {
      const res = await validateExcelMatrix.mutateAsync({ id: chartId, file: selectedFile });
      if (!res.isValid) {
        const errText =
          res.errors && res.errors.length > 0
            ? res.errors.join(' | ')
            : res.message || 'Validation failed. Check file format and matrix structure.';
        setErrorMsg(errText);
        setValidationResult(null);
        return;
      }
      setValidationResult(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Validation failed. Check file format and matrix structure.');
    }
  };

  const handleConfirmCommit = async () => {
    if (!validationResult?.importToken) return;
    setErrorMsg(null);
    try {
      await confirmExcelMatrix.mutateAsync({
        id: chartId,
        importToken: validationResult.importToken,
      });
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to commit staged rate matrix.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-[#091e42] text-white">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-300" />
            <div>
              <h3 className="font-bold text-sm tracking-wide">Import Excel Rate Matrix</h3>
              <p className="text-[11px] text-blue-200">Target Chart: {chartName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-gray-700">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Step 1: Upload File */}
          {!validationResult && (
            <div className="space-y-4">
              <div className="p-8 border-2 border-dashed border-gray-300 rounded-2xl text-center bg-gray-50/50 hover:bg-gray-50 transition flex flex-col items-center justify-center">
                <FileSpreadsheet className="w-12 h-12 text-[#0052cc] mb-3" />
                <p className="text-xs font-bold text-gray-800">Choose Excel Rate Matrix Spreadsheet</p>
                <p className="text-[11px] text-gray-500 mt-1 mb-4">Accepts .xlsx, .xls or .csv matrix grids</p>
                <label className="px-4 py-2 bg-[#0052cc] hover:bg-[#0747a6] text-white text-xs font-bold rounded-xl cursor-pointer transition shadow">
                  Browse File
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
                {selectedFile && (
                  <p className="mt-3 text-xs font-medium text-green-700 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" /> Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedFile || validateExcelMatrix.isPending}
                  onClick={handleValidate}
                  className="px-5 py-2 text-xs font-bold bg-[#0052cc] hover:bg-[#0747a6] disabled:bg-blue-300 text-white rounded-lg transition shadow-md cursor-pointer flex items-center gap-2"
                >
                  {validateExcelMatrix.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Validating Matrix...
                    </>
                  ) : (
                    'Validate Spreadsheet'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Validation Preview & Confirmation */}
          {validationResult && (
            <div className="space-y-4">
              <div className="p-3.5 bg-green-50 border border-green-200 rounded-xl text-green-800 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="font-semibold">Spreadsheet Validated Successfully!</span>
                </div>
                {validationResult.importToken && (
                  <span className="text-[11px] text-green-700">
                    Token: {validationResult.importToken.slice(0, 8)}...
                  </span>
                )}
              </div>

              {/* Matrix Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-gray-50 border rounded-xl text-center">
                  <span className="text-[10px] uppercase font-bold text-gray-500 block">Total Cells</span>
                  <span className="text-lg font-black text-[#091e42]">{validationResult.totalCells}</span>
                </div>
                <div className="p-3 bg-gray-50 border rounded-xl text-center">
                  <span className="text-[10px] uppercase font-bold text-gray-500 block">FAT Range</span>
                  <span className="text-sm font-bold text-[#091e42]">
                    {validationResult.minFat}% – {validationResult.maxFat}%
                  </span>
                </div>
                <div className="p-3 bg-gray-50 border rounded-xl text-center">
                  <span className="text-[10px] uppercase font-bold text-gray-500 block">SNF Range</span>
                  <span className="text-sm font-bold text-[#091e42]">
                    {validationResult.minSnf}% – {validationResult.maxSnf}%
                  </span>
                </div>
                <div className="p-3 bg-gray-50 border rounded-xl text-center">
                  <span className="text-[10px] uppercase font-bold text-gray-500 block">Grid Dimensions</span>
                  <span className="text-sm font-bold text-emerald-700">
                    {validationResult.totalFatSteps} × {validationResult.totalSnfSteps}
                  </span>
                </div>
              </div>

              {/* Sample Matrix Cells Preview */}
              {validationResult.sampleCells && validationResult.sampleCells.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-gray-700 block">
                    Sample Rate Cells Preview (First {validationResult.sampleCells.length} cells):
                  </span>
                  <div className="border border-gray-200 rounded-xl overflow-x-auto max-h-48">
                    <table className="w-full text-center text-xs">
                      <thead className="bg-gray-100 text-gray-700 font-bold sticky top-0">
                        <tr>
                          <th className="py-2 px-3 border-r">FAT (%)</th>
                          <th className="py-2 px-3 border-r">SNF (%)</th>
                          <th className="py-2 px-3">Rate (₹/L)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {validationResult.sampleCells.map((cell, idx) => (
                          <tr key={idx} className="hover:bg-blue-50/30">
                            <td className="py-1.5 px-3 font-bold bg-gray-50 border-r">{cell.fat}%</td>
                            <td className="py-1.5 px-3 border-r">{cell.snf}%</td>
                            <td className="py-1.5 px-3 font-mono font-semibold text-emerald-700">₹{cell.rate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Warnings / Notices */}
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

              {/* Confirmation Action */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setValidationResult(null)}
                  className="text-xs font-bold text-gray-600 hover:text-gray-800 underline cursor-pointer"
                >
                  Upload Different File
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={confirmExcelMatrix.isPending}
                    onClick={handleConfirmCommit}
                    className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg transition shadow-md cursor-pointer flex items-center gap-2"
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
          )}
        </div>
      </div>
    </div>
  );
};
