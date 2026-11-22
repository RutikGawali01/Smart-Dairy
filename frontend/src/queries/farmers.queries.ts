import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '../utils/api';
import { QUERY_KEYS } from './keys';
import type { Customer, AddFarmerInput, UpdateFarmerInput } from '../store/customer/useCustomerStore';
import { useCustomerStore } from '../store/customer/useCustomerStore';

/**
 * Fetch all farmers with automatic deduplication & SWR caching.
 */
export function useFarmersQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.farmers.list(),
    queryFn: async (): Promise<Customer[]> => {
      const data = await request<Customer[]>('/customer/all-customers');
      const normalized = (data ?? []).map((c) => ({
        ...c,
        isActive: c.isActive !== false,
      }));
      // Keep zustand store synchronized for legacy selectors
      useCustomerStore.setState({ farmers: normalized, status: 'success', error: null });
      return normalized;
    },
  });
}

/**
 * Farmer mutations with automatic cache invalidation & optimistic sync.
 */
export function useFarmerMutations() {
  const queryClient = useQueryClient();

  const createFarmer = useMutation({
    mutationFn: async (farmer: AddFarmerInput): Promise<Customer> => {
      const rawCode = farmer.customerCode.trim();
      const codeNum = parseInt(rawCode, 10);
      const nameStr = farmer.fullName.trim();

      const payload = {
        customerCode: rawCode,
        code: isNaN(codeNum) ? rawCode : codeNum,
        fullName: nameStr,
        name: nameStr,
        mobile: farmer.mobile.trim(),
        address: farmer.address?.trim() ?? '',
        milkType: farmer.milkType,
      };

      const res = await request<Customer>('/customer/create-new', 'POST', payload);
      return {
        ...res,
        isActive: res?.isActive !== false,
      };
    },
    onSuccess: (newFarmer) => {
      queryClient.setQueryData<Customer[]>(QUERY_KEYS.farmers.list(), (old) => {
        return old ? [newFarmer, ...old] : [newFarmer];
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.farmers.all });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard.stats() });
      // Sync store
      const current = useCustomerStore.getState().farmers;
      useCustomerStore.setState({ farmers: [newFarmer, ...current] });
    },
  });

  const updateFarmer = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateFarmerInput }): Promise<Customer> => {
      const payload = {
        fullName: input.fullName,
        name: input.fullName,
        mobile: input.mobile,
        address: input.address,
        milkType: input.milkType,
        bankName: input.bankName,
        accountNo: input.accountNo,
        ifscCode: input.ifscCode,
      };
      return await request<Customer>(`/customer/${id}`, 'PATCH', payload);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Customer[]>(QUERY_KEYS.farmers.list(), (old) => {
        if (!old) return [updated];
        return old.map((f) => (f.id === updated.id ? { ...f, ...updated } : f));
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.farmers.all });
      const current = useCustomerStore.getState().farmers;
      useCustomerStore.setState({
        farmers: current.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)),
      });
    },
  });

  const toggleFarmerStatus = useMutation({
    mutationFn: async (id: string): Promise<{ id: string; result: Customer }> => {
      const res = await request<Customer>(`/customer/${id}`, 'DELETE');
      return { id, result: res };
    },
    onSuccess: ({ id, result }) => {
      queryClient.setQueryData<Customer[]>(QUERY_KEYS.farmers.list(), (old) => {
        if (!old) return [];
        return old.map((f) => {
          if (f.id === id) {
            const nextActive = result && typeof result.isActive === 'boolean' ? result.isActive : !f.isActive;
            return { ...f, ...result, isActive: nextActive };
          }
          return f;
        });
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.farmers.all });
    },
  });

  return {
    createFarmer,
    updateFarmer,
    toggleFarmerStatus,
  };
}

