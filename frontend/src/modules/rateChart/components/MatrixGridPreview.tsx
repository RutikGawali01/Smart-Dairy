import React, { useMemo } from 'react';
import type { MilkType } from '../rateChart.types';

interface MatrixCell {
  fat: string;
  snf: string;
  rate: string;
}

interface MatrixGridPreviewProps {
  cells: MatrixCell[];
  fatSteps?: string[];
  snfSteps?: string[];
  milkType?: MilkType;
  chartName?: string;
}

export const MatrixGridPreview: React.FC<MatrixGridPreviewProps> = ({
  cells,
  fatSteps,
  snfSteps,
  milkType,
  chartName,
}) => {
  const { sortedFats, sortedSnfs, rateMap } = useMemo(() => {
    const map = new Map<string, string>();
    const fatSet = new Set<string>(fatSteps || []);
    const snfSet = new Set<string>(snfSteps || []);

    for (const c of cells) {
      const fKey = Number(c.fat).toFixed(1);
      const sKey = Number(c.snf).toFixed(1);
      map.set(`${fKey}:${sKey}`, c.rate);
      if (!fatSteps?.length) fatSet.add(fKey);
      if (!snfSteps?.length) snfSet.add(sKey);
    }

    const fats = Array.from(fatSet).sort((a, b) => Number(a) - Number(b));
    const snfs = Array.from(snfSet).sort((a, b) => Number(a) - Number(b));

    return { sortedFats: fats, sortedSnfs: snfs, rateMap: map };
  }, [cells, fatSteps, snfSteps]);

  const milkLabel =
    milkType === 'BUFFALO' ? 'Buffalo' : milkType === 'COW' ? 'Cow' : milkType === 'MIX' ? 'Mix' : null;

  return (
    <div className="border border-gray-300 rounded-xl overflow-hidden bg-white shadow-2xs">
      {/* Classic Price Setting Header Bar */}
      <div className="px-4 py-2.5 bg-gradient-to-b from-gray-100 to-gray-200 border-b border-gray-300 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-[#091e42] tracking-tight">Price Setting</span>
          {chartName && <span className="text-xs text-gray-500 font-medium">({chartName})</span>}
        </div>
        {milkLabel && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-gray-600">Buffalo/Cow</span>
            <span className="px-3 py-1 bg-white border border-gray-300 rounded font-bold text-[#091e42] shadow-2xs">
              {milkLabel}
            </span>
          </div>
        )}
      </div>

      {/* Scrollable 2D Matrix Grid */}
      <div className="overflow-auto max-h-[52vh] bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 min-w-[68px] py-1.5 px-3 bg-gradient-to-b from-orange-200 to-orange-300 text-orange-950 font-bold text-center border-b border-r border-gray-300">
                FAT
              </th>
              {sortedSnfs.map((snf) => (
                <th
                  key={snf}
                  className="sticky top-0 z-20 min-w-[68px] py-1.5 px-3 bg-gradient-to-b from-gray-100 to-gray-200 text-gray-900 font-bold text-right border-b border-r border-gray-300 font-mono tabular-nums"
                >
                  {Number(snf)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedFats.map((fat) => (
              <tr key={fat} className="group hover:bg-blue-50/40">
                <td className="sticky left-0 z-10 py-1 px-3 bg-gray-50 group-hover:bg-orange-100 text-gray-900 font-semibold text-right border-b border-r border-gray-300 font-mono tabular-nums">
                  {Number(fat)}
                </td>
                {sortedSnfs.map((snf) => {
                  const fKey = Number(fat).toFixed(1);
                  const sKey = Number(snf).toFixed(1);
                  const rate = rateMap.get(`${fKey}:${sKey}`);
                  return (
                    <td
                      key={`${fKey}:${sKey}`}
                      className="py-1 px-3 text-right border-b border-r border-gray-200 font-mono tabular-nums text-gray-800 whitespace-nowrap"
                    >
                      {rate ?? '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

