import React from 'react';
import type { UseFormRegister, FieldErrors } from 'react-hook-form';

interface DifferentialConfigFormProps {
  register: UseFormRegister<any>;
  errors: FieldErrors<any>;
}

export const DifferentialConfigForm: React.FC<DifferentialConfigFormProps> = ({ register, errors }) => {
  return (
    <div className="bg-blue-50/50 border border-blue-200/60 rounded-xl p-4 space-y-4">
      <div className="border-b border-blue-200/60 pb-2">
        <h4 className="text-xs font-bold text-[#091e42] uppercase tracking-wider">
          Base Differential Configuration
        </h4>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Rate increases/decreases dynamically from the Base Standard for each 0.1 FAT/SNF step.
        </p>
      </div>

      {/* Row 1: Base Reference Standards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700">
            Base FAT (%) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.1"
            placeholder="e.g. 3.5"
            {...register('differential.baseFat')}
            className="mt-1 w-full light-input rounded-lg text-xs py-1.5 px-2.5"
          />
          {errors?.differential && (errors.differential as any)?.baseFat && (
            <p className="text-[10px] text-red-600 mt-0.5">{(errors.differential as any).baseFat.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700">
            Base SNF (%) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.1"
            placeholder="e.g. 8.5"
            {...register('differential.baseSnf')}
            className="mt-1 w-full light-input rounded-lg text-xs py-1.5 px-2.5"
          />
          {errors?.differential && (errors.differential as any)?.baseSnf && (
            <p className="text-[10px] text-red-600 mt-0.5">{(errors.differential as any).baseSnf.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700">
            Base Rate (₹/L) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            placeholder="e.g. 35.00"
            {...register('differential.baseRate')}
            className="mt-1 w-full light-input rounded-lg text-xs py-1.5 px-2.5 font-bold text-[#0052cc]"
          />
          {errors?.differential && (errors.differential as any)?.baseRate && (
            <p className="text-[10px] text-red-600 mt-0.5">{(errors.differential as any).baseRate.message}</p>
          )}
        </div>
      </div>

      {/* Row 2: Differentials per 0.1 Unit */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700">
            FAT Diff (₹ / 0.1 FAT) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            placeholder="e.g. 0.40"
            {...register('differential.fatDifferential')}
            className="mt-1 w-full light-input rounded-lg text-xs py-1.5 px-2.5"
          />
          {errors?.differential && (errors.differential as any)?.fatDifferential && (
            <p className="text-[10px] text-red-600 mt-0.5">{(errors.differential as any).fatDifferential.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700">
            SNF Diff (₹ / 0.1 SNF) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            placeholder="e.g. 0.30"
            {...register('differential.snfDifferential')}
            className="mt-1 w-full light-input rounded-lg text-xs py-1.5 px-2.5"
          />
          {errors?.differential && (errors.differential as any)?.snfDifferential && (
            <p className="text-[10px] text-red-600 mt-0.5">{(errors.differential as any).snfDifferential.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700">
            Unit Step
          </label>
          <input
            type="number"
            step="0.01"
            defaultValue="0.1"
            {...register('differential.differentialUnit')}
            className="mt-1 w-full light-input rounded-lg text-xs py-1.5 px-2.5 bg-gray-50"
            readOnly
          />
        </div>
      </div>

      {/* Row 3: Minimum & Maximum Boundary Clamps (Optional) */}
      <div className="pt-2 border-t border-blue-200/40">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">
          Quality Boundary Limits (Clamps)
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-gray-600">Min FAT (%)</label>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 3.0"
              {...register('differential.minFat')}
              className="mt-1 w-full light-input rounded-lg text-xs py-1 px-2"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600">Max FAT (%)</label>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 6.0"
              {...register('differential.maxFat')}
              className="mt-1 w-full light-input rounded-lg text-xs py-1 px-2"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600">Min SNF (%)</label>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 8.0"
              {...register('differential.minSnf')}
              className="mt-1 w-full light-input rounded-lg text-xs py-1 px-2"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600">Max SNF (%)</label>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 9.5"
              {...register('differential.maxSnf')}
              className="mt-1 w-full light-input rounded-lg text-xs py-1 px-2"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

