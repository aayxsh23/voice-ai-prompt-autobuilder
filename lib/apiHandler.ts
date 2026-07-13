import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/** Thrown to return a specific HTTP status from inside a handler. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Wraps a route handler so uncaught errors return a safe, generic message
 * instead of leaking `error.message` (stack traces, DB details, etc.) to the
 * client. Known failures can be signalled with `throw new ApiError(status, msg)`.
 */
export function apiHandler<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return jsonError(err.message, err.status);
      }
      logger.error('unhandled API error', err);
      return jsonError('Internal server error', 500);
    }
  };
}
