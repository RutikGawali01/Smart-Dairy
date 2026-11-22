import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '../utils/api';
import { QUERY_KEYS } from './keys';
import type { DashboardStats } from '../store/dashboard/useDashboardStore';
import { useDashboardStore } from '../store/dashboard/useDashboardStore';
import type { AdminProfile } from '../store/profile/useProfileStore';
import { useProfileStore } from '../store/profile/useProfileStore';
import { useAuthStore } from '../store/auth/useAuthStore';

/**
 * Fetch real-time dashboard statistics with 60s background refetch.
 */
export function useDashboardStatsQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.dashboard.stats(),
    queryFn: async (): Promise<DashboardStats> => {
      const data = await request<DashboardStats>('/admin/dashboard');
      useDashboardStore.setState({ dashboardStats: data, status: 'success', error: null });
      return data;
    },
    refetchInterval: 60 * 1000, // Background poll every 60s
  });
}

/**
 * Fetch dairy admin profile.
 */
export function useProfileQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.profile.current(),
    queryFn: async (): Promise<AdminProfile> => {
      const data = await request<AdminProfile>('/admin/profile');
      useProfileStore.setState({ profile: data, status: 'success', error: null });
      return data;
    },
  });
}

/**
 * Admin profile mutations.
 */
export function useProfileMutations() {
  const queryClient = useQueryClient();

  const updateProfile = useMutation({
    mutationFn: async (payload: Partial<AdminProfile>) => {
      return await request<AdminProfile>('/admin/profile', 'PUT', payload);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEYS.profile.current(), updated);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profile.current() });

      useProfileStore.setState({ profile: updated, status: 'success', error: null });
      const authUser = useAuthStore.getState().user;
      if (authUser) {
        useAuthStore.setState({
          user: {
            ...authUser,
            dairyName: updated.dairyName ?? authUser.dairyName,
            collectionType: updated.collectionType ?? authUser.collectionType,
            milkType: updated.milkType ?? authUser.milkType,
            paymentPeriod: updated.paymentPeriod ?? authUser.paymentPeriod,
            collectionShift: updated.collectionShift ?? authUser.collectionShift,
            logoUrl: updated.logoUrl ?? authUser.logoUrl,
          },
        });
      }
    },
  });

  return {
    updateProfile,
  };
}

