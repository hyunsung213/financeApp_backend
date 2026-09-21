import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const money = z.coerce.number().int().positive();
const consumptionEvaluation = z.enum(['GOOD', 'NORMAL', 'REGRETTABLE', 'BAD']);

export const financeSettingSchema = z.object({ salaryAmount: z.coerce.number().int().nonnegative(), salaryDay: z.coerce.number().int().min(1).max(31), reportingStartDay: z.coerce.number().int().min(1).max(31).optional() });
export const allocationSchema = z.object({ name: z.string().min(1).max(50), allocationType: z.enum(['SAVING', 'INVESTMENT', 'FIXED_LIVING', 'FLEXIBLE', 'TRANSPORT', 'COMMUNICATION', 'SUBSCRIPTION', 'HOUSING', 'FOOD', 'OTHER']), percentage: z.coerce.number().min(0).max(100), spendability: z.enum(['LOCKED', 'RESERVED', 'FLEXIBLE']), active: z.boolean().optional() });
export const transactionSchema = z.object({ categoryId: z.string().min(1), type: z.enum(['EXPENSE', 'INCOME', 'SAVING']), amount: money, occurredAt: date, merchantOrTitle: z.string().min(1).max(120), memo: z.string().max(500).optional(), consumptionEvaluation: consumptionEvaluation.nullable().optional(), source: z.enum(['MANUAL', 'AUTO', 'RECEIPT', 'FIXED']).optional(), status: z.enum(['CONFIRMED', 'PENDING', 'EXCLUDED']).optional() });
export const transactionPatchSchema = transactionSchema.partial();
export const fixedExpenseSchema = z.object({ categoryId: z.string(), name: z.string().min(1).max(120), expectedAmount: money, billingDay: z.coerce.number().int().min(1).max(31), recurrenceType: z.enum(['MONTHLY', 'YEARLY']), startDate: date, endDate: date.optional() });
export const categorySchema = z.object({ name: z.string().trim().min(1).max(50), type: z.enum(['EXPENSE', 'INCOME', 'SAVING']), purposeType: z.enum(['GENERAL', 'SAVING', 'INVESTMENT']).optional(), parentCategoryId: z.string().trim().min(1).nullable().optional(), sortOrder: z.coerce.number().int().min(0).optional(), isActive: z.boolean().optional() });
export const categoryPatchSchema = z.object({ name: z.string().trim().min(1).max(50).optional(), parentCategoryId: z.string().trim().min(1).nullable().optional(), sortOrder: z.coerce.number().int().min(0).optional(), isActive: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0, 'At least one category field is required');
export const queryDateSchema = z.object({ startDate: date.optional(), endDate: date.optional(), categoryId: z.string().optional(), type: z.enum(['EXPENSE', 'INCOME', 'SAVING']).optional(), status: z.enum(['CONFIRMED', 'PENDING', 'EXCLUDED']).optional(), page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(50) });
export const policyQuerySchema = z.object({ category: z.string().optional(), region: z.string().optional(), age: z.coerce.number().int().min(0).max(120).optional(), providerType: z.enum(['GOVERNMENT', 'LOCAL_GOVERNMENT', 'PUBLIC', 'PRIVATE']).optional(), keyword: z.string().optional(), applicationStatus: z.enum(['OPEN', 'CLOSED']).optional() });
export const policySyncSchema = z.object({ pageIndex: z.coerce.number().int().positive().default(1), display: z.coerce.number().int().min(1).max(100).default(100), allPages: z.boolean().default(true), generatePresentation: z.boolean().default(true) });
export const policyCalendarEventSchema = z.object({ eventDate: date });
export const userProfileSchema = z.object({ age: z.coerce.number().int().min(0).max(120).nullable().optional(), region: z.string().trim().min(1).max(100).nullable().optional() }).refine((value) => value.age !== undefined || value.region !== undefined, 'At least one profile field is required');
export const notificationSchema = z.object({
  eventId: z.string().trim().min(1).max(255),
  packageName: z.string().trim().regex(/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/, 'Invalid Android package name'),
  title: z.string().max(500),
  content: z.string().max(10000),
  timestamp: z.coerce.number().int().positive(),
  source: z.literal('ANDROID_NOTIFICATION'),
});
