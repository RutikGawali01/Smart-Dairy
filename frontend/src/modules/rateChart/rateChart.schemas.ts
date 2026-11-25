import { z } from 'zod';

export const differentialFormSchema = z.object({
  baseFat: z.coerce.number().positive('Base FAT must be greater than 0'),
  baseSnf: z.coerce.number().positive('Base SNF must be greater than 0'),
  baseRate: z.coerce.number().positive('Base Rate must be greater than 0'),
  fatDifferential: z.coerce.number(),
  snfDifferential: z.coerce.number(),
  differentialUnit: z.coerce.number().default(0.1),
  minFat: z.coerce.number().optional().nullable(),
  maxFat: z.coerce.number().optional().nullable(),
  minSnf: z.coerce.number().optional().nullable(),
  maxSnf: z.coerce.number().optional().nullable(),
  minRate: z.coerce.number().optional().nullable(),
  maxRate: z.coerce.number().optional().nullable(),
});

export const createRateChartFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Chart name must be at least 2 characters')
      .max(100, 'Chart name cannot exceed 100 characters'),
    milkType: z.enum(['COW', 'BUFFALO', 'MIX']),
    method: z.enum(['RATE_TABLE', 'BASE_DIFFERENTIAL']),
    effectiveFrom: z.string().min(1, 'Effective from date is required'),
    effectiveTo: z.string().optional().nullable(),
    differential: differentialFormSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.effectiveTo && data.effectiveFrom) {
        return new Date(data.effectiveTo) >= new Date(data.effectiveFrom);
      }
      return true;
    },
    {
      message: 'Effective end date cannot be earlier than start date',
      path: ['effectiveTo'],
    }
  )
  .refine(
    (data) => {
      if (data.method === 'BASE_DIFFERENTIAL' && !data.differential) {
        return false;
      }
      return true;
    },
    {
      message: 'Differential configuration is required for Base Differential method',
      path: ['differential'],
    }
  );

export const updateRateChartFormSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    effectiveFrom: z.string().optional(),
    effectiveTo: z.string().optional().nullable(),
    differential: differentialFormSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.effectiveFrom && data.effectiveTo) {
        return new Date(data.effectiveTo) >= new Date(data.effectiveFrom);
      }
      return true;
    },
    {
      message: 'Effective end date cannot be earlier than start date',
      path: ['effectiveTo'],
    }
  );

export const previewRateSchema = z.object({
  fat: z.coerce.number().positive('FAT must be greater than 0'),
  snf: z.coerce.number().positive('SNF must be greater than 0'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0').default(1),
  collectionDate: z.string().optional(),
});

