export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}

export const notFound = (message = 'Resource not found') => new AppError('NOT_FOUND', message, 404);
