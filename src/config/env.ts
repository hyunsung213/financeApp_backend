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
  GEMINI_API_KEY: z.preprocess((value) => value || undefined, z.string().min(1).optional()),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
    NOTIFICATION_ALLOWED_PACKAGES: z.string().default('com.shcard.smartpay'),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DB_SSL: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  DEV_AUTH_BYPASS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});

export const env = schema.parse(process.env);
