import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { UniqueConstraintError } from 'sequelize';
import { AppError } from '../utils/errors';
import { logError } from '../utils/logging';

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(new AppError('NOT_FOUND', 'Route not found', 404));

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ') } });
  if (error instanceof AppError) return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
  // A unique index (e.g. one ACTIVE budget cycle per user) rejected a write
  // that raced a concurrent one: the client should re-read, not see a 500.
  if (error instanceof UniqueConstraintError) return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'The resource was changed by a concurrent request' } });
  // Only the server log gets the cause; the path is logged without its query.
  logError('Unexpected 500', error, { context: `${req.method} ${req.originalUrl.split('?')[0]}`, stack: true });
  return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
