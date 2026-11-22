import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '../utils/api';
import { QUERY_KEYS } from './keys';
import type { SettlementRecord, CreateSettlementInput } from '../store/billing/useBillingStore';
import { useBillingStore } from '../store/billing/useBillingStore';

export function useSettlementsQuery(customerId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.billing.settlements(customerId),
    queryFn: async (): Promise<SettlementRecord[]> => {
      const qs = customerId ? `?customerId=${encodeURIComponent(customerId)}` : '';
      const data = await request<SettlementRecord[]>(`/billing/history${qs}`);
      const list = data ?? [];
      useBillingStore.setState({ settlements: list, status: 'success', error: null });
      return list;
    },
  });
}

export function useBillingMutations() {
  const queryClient = useQueryClient();

  const createSettlement = useMutation({
    mutationFn: async (payload: CreateSettlementInput) => {
      return await request<SettlementRecord>('/billing/settle', 'POST', payload);
    },
    onSuccess: (newRecord) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.billing.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.advances.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.farmers.all });
      const current = useBillingStore.getState().settlements;
      useBillingStore.setState({ settlements: [newRecord, ...current] });
    },
  });

  return {
    createSettlement,
  };
}

