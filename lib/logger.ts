/**
 * Minimal leveled logger. Replaces scattered console.* calls so verbose debug
 * output (LLM "thinking" dumps, assembler traces) is silenced in production while
 * warnings/errors still surface. Level is controlled by LOG_LEVEL, defaulting to
 * 'info' in production and 'debug' otherwise.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = (process.env.LOG_LEVEL as Level | undefined)
    || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  return ORDER[configured] ?? ORDER.info;
}

function emit(level: Level, message: string, meta?: unknown): void {
  if (ORDER[level] < threshold()) return;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta !== undefined) sink(`[${level}] ${message}`, meta);
  else sink(`[${level}] ${message}`);
  // Observability seam: forward level === 'error' to Sentry/etc. here once a DSN
  // and transport are configured.
}

export const logger = {
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};
