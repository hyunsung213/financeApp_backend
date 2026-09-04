import type { NextFunction, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { User } from '../models';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    if (env.NODE_ENV !== 'production' && env.DEV_AUTH_BYPASS) {
      const devUserId = '00000000-0000-4000-8000-000000000001';
      req.authUser = { id: devUserId, email: 'seed@example.local' };
      await User.upsert({ id: devUserId, email: 'seed@example.local' });
      return next();
    }
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new AppError('UNAUTHORIZED', 'Bearer token is required', 401);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
    req.authUser = { id: data.user.id, email: data.user.email };
    await User.upsert({ id: data.user.id, email: data.user.email ?? `${data.user.id}@unknown.local` });
    next();
  } catch (error) { next(error); }
}
