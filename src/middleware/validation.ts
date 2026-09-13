import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export const validate = (schema: ZodType): RequestHandler => (req, _res, next) => {
  try { req.body = schema.parse(req.body); next(); } catch (error) { next(error); }
};

export const validateQuery = (schema: ZodType): RequestHandler => (req, res, next) => {
  try { res.locals.validatedQuery = schema.parse(req.query); next(); } catch (error) { next(error); }
};
