import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '../utils/api';
import { QUERY_KEYS } from './keys';
import type { MilkEntry, CreateMilkEntryInput } from '../store/collection/useMilkCollectionStore';
import { useMilkCollectionStore } from '../store/collection/useMilkCollectionStore';

function mapRawMilkEntry(item: any): MilkEntry {
  let dateStr = new Date().toISOString().split('T')[0];
  if (item.date) {
    const d = new Date(item.date);
    dateStr =
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0');
  }
  return {
    id: item.id,
    date: dateStr,
    shift: item.shift,
    quantity: item.quantity,
    fat: item.fat ?? 0,
    snf: item.snf ?? 0,
    rate: item.rate ?? 0,
    totalAmount: item.totalAmount ?? 0,
    customerId: item.customerId,
    customerName: item.customer?.name ?? 'Unknown',
    customerCode: item.customer?.code ?? 0,
    milkType: item.milkType,
    createdAt: item.createdAt,
  };
}

/**
 * Fetch today's milk collection entries with automatic deduplication & SWR caching.
 */
export function useTodayMilkQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.milk.today(),
    queryFn: async (): Promise<MilkEntry[]> => {
      const data: any[] = await request('/milk/today');
      const mapped = (data ?? []).map(mapRawMilkEntry);
      // Sync store
      useMilkCollectionStore.setState({ collections: mapped, status: 'success', error: null });
      return mapped;
    },
  });
}

/**
 * Fetch historical milk entries with filter params.
 */
export function useMilkHistoryQuery(params?: { startDate?: string; endDate?: string; customerId?: string }) {
  return useQuery({
    queryKey: QUERY_KEYS.milk.history(params),
    queryFn: async (): Promise<MilkEntry[]> => {
      const queryParts: string[] = [];
      if (params?.startDate) queryParts.push(`startDate=${params.startDate}`);
      if (params?.endDate) queryParts.push(`endDate=${params.endDate}`);
      if (params?.customerId) queryParts.push(`customerId=${params.customerId}`);
      const qs = queryParts.length ? `?${queryParts.join('&')}` : '';

      const data: any[] = await request(`/milk/history${qs}`);
      const mapped = (data ?? []).map(mapRawMilkEntry);
      useMilkCollectionStore.setState({ history: mapped, status: 'success', error: null });
      return mapped;
    },
  });
}

/**
 * Milk collection mutations with automatic cache invalidation of collections and dashboard stats.
 */
export function useMilkMutations() {
  const queryClient = useQueryClient();

  const createEntry = useMutation({
    mutationFn: async (entry: CreateMilkEntryInput) => {
      return await request('/milk/milk-entry', 'POST', {
        customerCode: String(entry.customerCode),
        code: Number(entry.customerCode),
        shift: entry.shift,
        milkType: entry.milkType,
        quantity: Number(entry.quantity),
        fat: Number(entry.fat),
        snf: Number(entry.snf),
        rate: entry.rate,
        totalAmount: entry.totalAmount,
        rateChartId: entry.rateChartId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.milk.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard.stats() });
    },
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, entry }: { id: string; entry: Partial<CreateMilkEntryInput> }) => {
      const payload: any = {};
      if (entry.customerCode) payload.customerCode = String(entry.customerCode);
      if (entry.shift) payload.shift = entry.shift;
      if (entry.milkType) payload.milkType = entry.milkType;
      if (entry.quantity) payload.quantity = Number(entry.quantity);
      if (entry.fat !== undefined) payload.fat = Number(entry.fat);
      if (entry.snf !== undefined) payload.snf = Number(entry.snf);
      if (entry.rate !== undefined) payload.rate = entry.rate;
      if (entry.totalAmount !== undefined) payload.totalAmount = entry.totalAmount;
      if (entry.rateChartId) payload.rateChartId = entry.rateChartId;
      return await request(`/milk/${id}`, 'PATCH', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.milk.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard.stats() });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      return await request(`/milk/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.milk.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard.stats() });
    },
  });

  return {
    createEntry,
    updateEntry,
    deleteEntry,
  };
}
