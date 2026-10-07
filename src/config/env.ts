import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    YOUTH_POLICY_API_KEY: z.string().min(1),
  YOUTH_POLICY_API_URL: z.string().url().default('https://www.youthcenter.go.kr/go/ythip/getPlcy'),
  POLICY_SYNC_SCHEDULER_ENABLED: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  POLICY_SYNC_CRON: z.string().min(1).default('0 18 * * *'),
  POLICY_SYNC_TIMEZONE: z.string().min(1).default('Asia/Seoul'),
  POLICY_SYNC_PAGE_SIZE: z.coerce.number().int().min(1).max(100).default(100),
  GEMINI_API_KEY: z.preprocess((value) => value || undefined, z.string().min(1).optional()),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
    NOTIFICATION_ALLOWED_PACKAGES: z.string().default('com.shcard.smartpay'),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DB_SSL: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  // PEM of the Supabase root CA (Dashboard > Database > SSL Configuration).
  // With it the DB certificate is verified; one-line values may use \n.
  DB_SSL_CA: z.preprocess((value) => value || undefined, z.string().min(1).optional()).transform((value) => value?.replace(/\\n/g, '\n')),
  DEV_AUTH_BYPASS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
}).superRefine((value, ctx) => {
  // Production must authenticate every request with Supabase: refuse to start
  // rather than silently ignore a bypass or a placeholder project.
  if (value.NODE_ENV !== 'production') return;
  if (value.DEV_AUTH_BYPASS) ctx.addIssue({ code: 'custom', path: ['DEV_AUTH_BYPASS'], message: 'DEV_AUTH_BYPASS must be false in production' });
  if (/your-project|localhost/.test(value.SUPABASE_URL)) ctx.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: 'SUPABASE_URL must point at the real Supabase project in production' });
  if (value.DB_SSL && !value.DB_SSL_CA) ctx.addIssue({ code: 'custom', path: ['DB_SSL_CA'], message: 'DB_SSL_CA must be set in production so the database certificate is verified' });
});

export const env = schema.parse(process.env);
