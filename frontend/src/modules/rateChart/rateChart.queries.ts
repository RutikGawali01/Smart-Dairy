import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rateChartApi } from './rateChart.api';
import { QUERY_KEYS } from '../../queries/keys';
import type {
  GetRateChartsQueryParams,
  CreateRateChartPayload,
  UpdateRateChartPayload,
} from './rateChart.types';

export function useRateChartsQuery(params: GetRateChartsQueryParams = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.rateCharts.list(params),
    queryFn: () => rateChartApi.getRateCharts(params),
  });
}

export function useRateChartDetailQuery(id?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.rateCharts.detail(id || ''),
    queryFn: () => rateChartApi.getRateChart(id!),
    enabled: !!id,
  });
}

export function useRateChartHistoryQuery(id?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.rateCharts.history(id || ''),
    queryFn: () => rateChartApi.getChartHistory(id!),
    enabled: !!id,
  });
}

export function useRateChartMutations() {
  const queryClient = useQueryClient();

  const invalidateRateCharts = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rateCharts.all });
  };

  const createChart = useMutation({
    mutationFn: (payload: CreateRateChartPayload) => rateChartApi.createRateChart(payload),
    onSuccess: () => invalidateRateCharts(),
  });

  const updateChart = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateRateChartPayload }) =>
      rateChartApi.updateRateChart(id, payload),
    onSuccess: () => invalidateRateCharts(),
  });

  const deleteChart = useMutation({
    mutationFn: (id: string) => rateChartApi.deleteRateChart(id),
    onSuccess: () => invalidateRateCharts(),
  });

  const activateChart = useMutation({
    mutationFn: ({ id, confirmReplace }: { id: string; confirmReplace?: boolean }) =>
      rateChartApi.activateRateChart(id, confirmReplace),
    onSuccess: () => invalidateRateCharts(),
  });

  const deactivateChart = useMutation({
    mutationFn: (id: string) => rateChartApi.deactivateRateChart(id),
    onSuccess: () => invalidateRateCharts(),
  });

  const validateExcelMatrix = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      rateChartApi.validateExcelMatrix(id, file),
  });

  const confirmExcelMatrix = useMutation({
    mutationFn: ({ id, importToken }: { id: string; importToken: string }) =>
      rateChartApi.confirmExcelMatrix(id, importToken),
    onSuccess: () => invalidateRateCharts(),
  });

  return {
    createChart,
    updateChart,
    deleteChart,
    activateChart,
    deactivateChart,
    validateExcelMatrix,
    confirmExcelMatrix,
  };
}

