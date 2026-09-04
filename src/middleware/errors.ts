import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(new AppError('NOT_FOUND', 'Route not found', 404));

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ') } });
  if (error instanceof AppError) return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
