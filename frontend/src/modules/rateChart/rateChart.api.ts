import { request } from '../../utils/api';
import type {
  RateChart,
  PaginatedRateCharts,
  GetRateChartsQueryParams,
  CreateRateChartPayload,
  UpdateRateChartPayload,
  CalculateRateInput,
  CalculateRateResult,
  ExcelValidateResponse,
} from './rateChart.types';

export const rateChartApi = {
  // 1. List Rate Charts with filters & pagination
  getRateCharts: async (params: GetRateChartsQueryParams = {}): Promise<PaginatedRateCharts> => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.search) query.set('search', params.search);
    if (params.milkType) query.set('milkType', params.milkType);
    if (params.method) query.set('method', params.method);
    if (params.status) query.set('status', params.status);

    const qs = query.toString() ? `?${query.toString()}` : '';
    return await request<PaginatedRateCharts>(`/rate-charts${qs}`);
  },

  // 2. Get Single Rate Chart details
  getRateChart: async (id: string): Promise<RateChart> => {
    return await request<RateChart>(`/rate-charts/${id}`);
  },

  // 3. Create Draft Rate Chart
  createRateChart: async (payload: CreateRateChartPayload): Promise<RateChart> => {
    return await request<RateChart>('/rate-charts', 'POST', payload);
  },

  // 4. Update Draft Rate Chart
  updateRateChart: async (id: string, payload: UpdateRateChartPayload): Promise<RateChart> => {
    return await request<RateChart>(`/rate-charts/${id}`, 'PUT', payload);
  },

  // 5. Delete Draft Rate Chart
  deleteRateChart: async (id: string): Promise<{ message: string }> => {
    return await request<{ message: string }>(`/rate-charts/${id}`, 'DELETE');
  },

  // 6. Activate Rate Chart (supports optional replacement confirmation on 409)
  activateRateChart: async (id: string, confirmReplace = false): Promise<RateChart> => {
    return await request<RateChart>(`/rate-charts/${id}/activate`, 'POST', { confirmReplace });
  },

  // 7. Deactivate Rate Chart
  deactivateRateChart: async (id: string): Promise<RateChart> => {
    return await request<RateChart>(`/rate-charts/${id}/deactivate`, 'POST');
  },

  // 8. Preview calculation for specific chart
  previewChartRate: async (
    id: string,
    payload: { fat: number | string; snf: number | string; quantity?: number | string; collectionDate?: string }
  ): Promise<CalculateRateResult> => {
    return await request<CalculateRateResult>(`/rate-charts/${id}/preview`, 'POST', payload);
  },

  // 9. Get Chart Version History
  getChartHistory: async (id: string): Promise<{ milkType: string; history: RateChart[] }> => {
    return await request<{ milkType: string; history: RateChart[] }>(`/rate-charts/${id}/history`);
  },

  // 10. Step 1: Validate & Stage Excel Matrix
  validateExcelMatrix: async (id: string, file: File): Promise<ExcelValidateResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    return await request<ExcelValidateResponse>(`/rate-charts/${id}/import/validate`, 'POST', formData);
  },

  // 11. Step 2: Confirm Staged Matrix Import
  confirmExcelMatrix: async (id: string, importToken: string): Promise<RateChart> => {
    return await request<RateChart>(`/rate-charts/${id}/import/confirm`, 'POST', { importToken });
  },

  // 12. Authoritative Quick Rate Calculation for Collection Desk
  calculateRate: async (input: CalculateRateInput): Promise<CalculateRateResult> => {
    return await request<CalculateRateResult>('/rate-charts/calculate', 'POST', input);
  },

  // 13. Download Standard Excel Rate Matrix Template
  downloadTemplate: async (): Promise<void> => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api/v1';
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${apiBase}/rate-charts/template`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error(`Failed to download template (${res.status})`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Rate_Chart_Matrix_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

