import { Request, Response, NextFunction } from 'express';
import logger from '../logger';

/**
 * Terminal error and 404 handling (finding F-24).
 *
 * Express had no terminal error middleware, so a thrown async error in any handler left
 * the request hanging until the client timed out, with nothing logged. It also had no
 * 404 handler, so an unknown path fell through to Express's default HTML response —
 * confusing for an API client and a small information leak about the stack in use.
 */

/** Error carrying an intended HTTP status. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Mount after every route. Returns a JSON 404 rather than Express's HTML default. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
    method: req.method,
    path: req.originalUrl,
  });
}

/**
 * Terminal error handler. Must be mounted last and must keep all four parameters —
 * Express identifies error middleware by arity, so removing `next` silently disables it.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;

  logger.error(
    {
      err: error,
      method: req.method,
      url: req.originalUrl,
      statusCode,
      // Identity only — never the body, which may carry credentials (finding F-16).
      userId: req.user?.userId,
    },
    'Unhandled error in request'
  );

  // A response may already be streaming (a file download, for instance); handing it to
  // Express lets it destroy the socket rather than corrupt the body.
  if (res.headersSent) {
    _next(error);
    return;
  }

  const body: Record<string, unknown> = {
    error: statusCode === 500 ? 'Internal server error' : (error as Error).message,
    code: error instanceof HttpError ? (error.code ?? 'HTTP_ERROR') : 'INTERNAL_ERROR',
  };

  // Stack traces and internal messages are withheld in production, where they would
  // disclose file paths and library versions to a caller.
  if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
    body.message = error.message;
    body.stack = error.stack;
  }

  res.status(statusCode).json(body);
}

/**
 * Wrap an async handler so a rejected promise reaches the error handler.
 *
 * Express 5 forwards rejections automatically, so this is only needed for handlers that
 * are invoked outside the router. Retained for explicit use.
 */
export function asyncHandler<T extends (...args: any[]) => Promise<unknown>>(handler: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
