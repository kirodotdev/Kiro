/**
 * Unit tests for retry utilities
 */

import { retryWithBackoff, RetryOptions } from '../retry_utils';

// Options that make sleeps effectively instant for fast, deterministic tests.
const fastOpts: RetryOptions = { baseDelay: 0, maxDelay: 0 };

describe('retryWithBackoff', () => {
  beforeEach(() => {
    // Silence the informational logging the function emits during retries.
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('success paths', () => {
    it('returns the result without retrying when fn succeeds on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('ok');

      await expect(retryWithBackoff(fn, fastOpts)).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on a retryable error and resolves once fn succeeds', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ThrottlingException: slow down'))
        .mockResolvedValueOnce('done');

      await expect(retryWithBackoff(fn, fastOpts)).resolves.toBe('done');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('preserves the resolved value type', async () => {
      const value = { id: 42, name: 'issue' };
      const fn = jest.fn().mockResolvedValue(value);

      await expect(retryWithBackoff(fn, fastOpts)).resolves.toEqual(value);
    });
  });

  describe('non-retryable errors', () => {
    it('throws immediately without retrying when the error is not retryable', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('ValidationError'));

      await expect(retryWithBackoff(fn, fastOpts)).rejects.toThrow('ValidationError');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry exhaustion', () => {
    it('throws the last error after exhausting the default 3 retries (4 attempts total)', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('ThrottlingException'));

      await expect(retryWithBackoff(fn, fastOpts)).rejects.toThrow('ThrottlingException');
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('respects a custom maxRetries value', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('ServiceUnavailable'));

      await expect(
        retryWithBackoff(fn, { ...fastOpts, maxRetries: 2 })
      ).rejects.toThrow('ServiceUnavailable');
      expect(fn).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
    });

    it('throws the most recent error instance', async () => {
      const first = new Error('ThrottlingException #1');
      const last = new Error('ThrottlingException #2');
      const fn = jest
        .fn()
        .mockRejectedValueOnce(first)
        .mockRejectedValueOnce(last);

      await expect(
        retryWithBackoff(fn, { ...fastOpts, maxRetries: 1 })
      ).rejects.toBe(last);
    });
  });

  describe('retryable error detection', () => {
    it('detects a retryable error via error.code', async () => {
      const err: any = new Error('socket hang up');
      err.code = 'ECONNRESET';
      const fn = jest.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');

      await expect(retryWithBackoff(fn, fastOpts)).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('detects a retryable error via error.status', async () => {
      const err: any = new Error('boom');
      err.status = 'ETIMEDOUT';
      const fn = jest.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');

      await expect(retryWithBackoff(fn, fastOpts)).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('detects a retryable error via error.name', async () => {
      const err: any = new Error('upstream failure');
      err.name = 'ServiceUnavailable';
      const fn = jest.fn().mockRejectedValueOnce(err).mockResolvedValueOnce('ok');

      await expect(retryWithBackoff(fn, fastOpts)).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('honors a custom retryableErrors list', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('CustomTransient'))
        .mockResolvedValueOnce('ok');

      await expect(
        retryWithBackoff(fn, { ...fastOpts, retryableErrors: ['CustomTransient'] })
      ).resolves.toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('treats an error not in a custom list as non-retryable', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('ThrottlingException'));

      // ThrottlingException is a default, but a custom list overrides defaults.
      await expect(
        retryWithBackoff(fn, { ...fastOpts, retryableErrors: ['SomethingElse'] })
      ).rejects.toThrow('ThrottlingException');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('exponential backoff timing', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('uses exponential delays capped at maxDelay', async () => {
      const delays: number[] = [];
      // Capture each requested delay and invoke the callback synchronously so
      // the retry loop proceeds without real waiting.
      jest
        .spyOn(global, 'setTimeout')
        .mockImplementation(((cb: () => void, ms?: number) => {
          delays.push(ms ?? 0);
          cb();
          return 0 as unknown as NodeJS.Timeout;
        }) as unknown as typeof setTimeout);

      const fn = jest.fn().mockRejectedValue(new Error('ThrottlingException'));

      await expect(
        retryWithBackoff(fn, { maxRetries: 4, baseDelay: 100, maxDelay: 500 })
      ).rejects.toThrow('ThrottlingException');

      // Delays after attempts 0..3 (the final attempt does not sleep):
      // 100*2^0=100, 100*2^1=200, 100*2^2=400, 100*2^3=800 -> capped to 500
      expect(delays).toEqual([100, 200, 400, 500]);
      expect(fn).toHaveBeenCalledTimes(5);
    });
  });
});
