import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { request } from '../utils/api';
import { QUERY_KEYS } from './keys';
import type {
  FoodDealer,
  FoodPurchase,
  FoodSale,
  CreateDealerInput,
  UpdateDealerInput,
  CreatePurchaseInput,
  CreateSaleInput,
} from '../store/feed/useFeedStore';
import { useFeedStore } from '../store/feed/useFeedStore';

export function useFeedDealersQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.feed.dealers(),
    queryFn: async (): Promise<FoodDealer[]> => {
      const data = await request<FoodDealer[]>('/food-dealers/get-all-dealers');
      const list = data ?? [];
      useFeedStore.setState({ dealers: list, status: 'success', error: null });
      return list;
    },
  });
}

export function useFeedPurchasesQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.feed.purchases(),
    queryFn: async (): Promise<FoodPurchase[]> => {
      const data = await request<FoodPurchase[]>('/food-purchases/all-purchases');
      const list = data ?? [];
      useFeedStore.setState({ purchases: list, status: 'success', error: null });
      return list;
    },
  });
}

export function useFeedSalesQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.feed.sales(),
    queryFn: async (): Promise<FoodSale[]> => {
      const data = await request<FoodSale[]>('/food-sales/get-all-sales');
      const list = data ?? [];
      useFeedStore.setState({ sales: list, status: 'success', error: null });
      return list;
    },
  });
}

export function useFeedMutations() {
  const queryClient = useQueryClient();

  const createDealer = useMutation({
    mutationFn: async (dealer: CreateDealerInput) => {
      return await request('/food-dealers/create-new-dealer', 'POST', {
        code: dealer.code,
        name: dealer.name,
        phone: dealer.phone,
        address: dealer.address ?? '',
        isActive: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.feed.dealers() });
    },
  });

  const updateDealer = useMutation({
    mutationFn: async ({ id, dealer }: { id: string; dealer: Partial<UpdateDealerInput> }) => {
      return await request(`/food-dealers/${id}`, 'PATCH', dealer);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.feed.dealers() });
    },
  });

  const toggleDealerStatus = useMutation({
    mutationFn: async (id: string) => {
      return await request(`/food-dealers/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.feed.dealers() });
    },
  });

  const createPurchase = useMutation({
    mutationFn: async (purchase: CreatePurchaseInput) => {
      return await request('/food-purchases/create', 'POST', {
        dealerId: purchase.dealerId,
        foodName: purchase.foodName,
        quantity: Number(purchase.quantity),
        buyRate: Number(purchase.buyRate),
        sellRate: Number(purchase.sellRate),
        amountPaid: Number(purchase.amountPaid),
        purchaseDate: purchase.purchaseDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.feed.purchases() });
    },
  });

  const createSale = useMutation({
    mutationFn: async (sale: CreateSaleInput) => {
      return await request('/food-sales/create', 'POST', {
        customerId: sale.customerId,
        foodPurchaseId: sale.foodPurchaseId,
        quantity: Number(sale.quantity),
        amountPaid: Number(sale.amountPaid),
        isCashPayment: sale.isCashPayment,
        saleDate: sale.saleDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.feed.sales() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.feed.purchases() });
    },
  });

  return {
    createDealer,
    updateDealer,
    toggleDealerStatus,
    createPurchase,
    createSale,
  };
}

