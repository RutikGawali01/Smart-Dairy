import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '../utils/api';
import { QUERY_KEYS } from './keys';
import type {
  Advance,
  AdvancePagination,
  CustomerAdvanceSummary,
  FetchAdvancesParams,
} from '../store/advance/useAdvanceStore';
import { useAdvanceStore } from '../store/advance/useAdvanceStore';

export function useAdvancesQuery(params: FetchAdvancesParams = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.advances.list(params),
    queryFn: async (): Promise<{ advances: Advance[]; pagination: AdvancePagination | null }> => {
      const queryParts: string[] = [];
      if (params.page) queryParts.push(`page=${params.page}`);
      if (params.limit) queryParts.push(`limit=${params.limit}`);
      if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
      if (params.status) queryParts.push(`status=${params.status}`);

      const queryString = queryParts.length ? `?${queryParts.join('&')}` : '';
      const data = await request<{
        advances: Advance[];
        pagination: AdvancePagination;
      }>(`/advance${queryString}`);

      const normalizedAdvances = (data.advances ?? []).map((a) => ({
        ...a,
        originalAmount: Number(a.originalAmount) || 0,
        recoveredAmount: Number(a.recoveredAmount) || 0,
        pendingAmount: Number(a.pendingAmount) || 0,
        transactions: a.transactions?.map((t) => ({
          ...t,
          amount: Number(t.amount) || 0,
        })),
      }));

      useAdvanceStore.setState({
        advances: normalizedAdvances,
        pagination: data.pagination ?? null,
        status: 'success',
        error: null,
      });

      return { advances: normalizedAdvances, pagination: data.pagination ?? null };
    },
  });
}

export function useCustomerAdvancesQuery(customerId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.advances.byCustomer(customerId),
    queryFn: async (): Promise<CustomerAdvanceSummary> => {
      const data = await request<CustomerAdvanceSummary>(`/advance/customer/${customerId}`);
      useAdvanceStore.setState({ customerSummary: data, status: 'success', error: null });
      return data;
    },
    enabled: !!customerId,
  });
}

export function useAdvanceMutations() {
  const queryClient = useQueryClient();

  const createAdvance = useMutation({
    mutationFn: async (data: { customerId: string; amount: number; givenDate: string; notes?: string }) => {
      return await request<Advance>('/advance', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.advances.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.farmers.all });
    },
  });

  const createRepayment = useMutation({
    mutationFn: async ({ advanceId, data }: { advanceId: string; data: { amount: number; notes?: string } }) => {
      return await request<Advance>(`/advance/${advanceId}/repayments`, 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.advances.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.farmers.all });
    },
  });

  return {
    createAdvance,
    createRepayment,
  };
}

