import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from './logger';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
});

describe('logger', () => {
  it('suppresses debug below the configured level', () => {
    process.env.LOG_LEVEL = 'warn';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logger.debug('should be hidden');
    expect(log).not.toHaveBeenCalled();
  });

  it('still emits warn and error at warn level', () => {
    process.env.LOG_LEVEL = 'warn';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logger.warn('w');
    logger.error('e');
    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it('emits debug when level is debug', () => {
    process.env.LOG_LEVEL = 'debug';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    logger.debug('d');
    expect(log).toHaveBeenCalledOnce();
  });
});
