import { useState, useEffect } from 'react';
import { rateChartApi } from '../rateChart.api';
import type { MilkType, CalculateRateResult } from '../rateChart.types';

interface UseLiveRateCalculatorProps {
  milkType: MilkType;
  fat: string | number;
  snf: string | number;
  quantity: string | number;
  collectionDate?: string;
  debounceMs?: number;
}

export interface LiveRateCalculatorState {
  result: CalculateRateResult | null;
  rate: string;
  totalAmount: string;
  chartName: string;
  method: string;
  formulaDescription: string;
  isLoading: boolean;
  error: string | null;
  isUnavailable: boolean;
}

export function useLiveRateCalculator({
  milkType,
  fat,
  snf,
  quantity,
  collectionDate,
  debounceMs = 300,
}: UseLiveRateCalculatorProps): LiveRateCalculatorState {
  const [result, setResult] = useState<CalculateRateResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  useEffect(() => {
    const numFat = parseFloat(String(fat));
    const numSnf = parseFloat(String(snf));
    const numQty = parseFloat(String(quantity));

    // Reset if inputs are missing or invalid
    if (!milkType || isNaN(numFat) || numFat <= 0 || isNaN(numSnf) || numSnf <= 0) {
      setResult(null);
      setError(null);
      setIsUnavailable(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsUnavailable(false);

    const timer = setTimeout(async () => {
      try {
        let validDateIso: string;
        if (collectionDate) {
          validDateIso = collectionDate.includes('T')
            ? new Date(collectionDate).toISOString()
            : new Date(`${collectionDate}T12:00:00.000Z`).toISOString();
        } else {
          validDateIso = new Date().toISOString();
        }

        const calcRes = await rateChartApi.calculateRate({
          milkType,
          fat: numFat,
          snf: numSnf,
          quantity: isNaN(numQty) || numQty <= 0 ? 1 : numQty,
          collectionDate: validDateIso,
        });

        setResult(calcRes);
        setError(null);
        setIsUnavailable(false);
      } catch (err: any) {
        setResult(null);
        const errMsg = err.message || 'Rate calculation unavailable';
        setError(errMsg);
        // If 404 or missing active chart
        if (err.statusCode === 404 || err.status === 404 || errMsg.toLowerCase().includes('no active')) {
          setIsUnavailable(true);
        }
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [milkType, fat, snf, quantity, collectionDate, debounceMs]);

  return {
    result,
    rate: result?.rate ?? '0.00',
    totalAmount: result?.totalAmount ?? '0.00',
    chartName: result?.rateChartName ?? '',
    method: result?.method ?? '',
    formulaDescription: result?.details?.formulaDescription ?? '',
    isLoading,
    error,
    isUnavailable,
  };
}
