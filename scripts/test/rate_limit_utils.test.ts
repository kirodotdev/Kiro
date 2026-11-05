/**
 * Unit tests for rate limit utilities
 */

import { checkRateLimit, processBatch } from '../rate_limit_utils';

describe('processBatch', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('processes every item and preserves input order across batches', async () => {
    const items = [1, 2, 3, 4, 5];
    const processor = jest.fn(async (n: number) => n * 2);

    const results = await processBatch(items, 2, processor, 0);

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(processor).toHaveBeenCalledTimes(5);
  });

  it('returns an empty array and never calls the processor for empty input', async () => {
    const processor = jest.fn(async (n: number) => n);

    const results = await processBatch([], 3, processor, 0);

    expect(results).toEqual([]);
    expect(processor).not.toHaveBeenCalled();
  });

  it('handles a batch size larger than the number of items (single batch)', async () => {
    const items = ['a', 'b'];
    const processor = jest.fn(async (s: string) => s.toUpperCase());

    const results = await processBatch(items, 10, processor, 0);

    expect(results).toEqual(['A', 'B']);
    expect(processor).toHaveBeenCalledTimes(2);
  });

  it('processes items within a batch in parallel', async () => {
    const order: string[] = [];
    const items = [30, 10, 20];
    // Lower numbers resolve sooner; parallel execution within the batch means
    // completion order follows the delay, not the input order.
    const processor = (n: number) =>
      new Promise<number>((resolve) => {
        setTimeout(() => {
          order.push(`done-${n}`);
          resolve(n);
        }, n);
      });

    const results = await processBatch(items, 3, processor, 0);

    // Results stay in input order...
    expect(results).toEqual([30, 10, 20]);
    // ...but they completed in delay order, proving parallel execution.
    expect(order).toEqual(['done-10', 'done-20', 'done-30']);
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // The module checks the live rate limit only on every 10th call. Ten
  // consecutive calls always span exactly one multiple of ten, so the API is
  // queried exactly once per helper invocation regardless of prior state.
  function callTenTimes(client: any): Promise<void[]> {
    return Promise.all(
      Array.from({ length: 10 }, () => checkRateLimit(client))
    );
  }

  function makeClient(remaining: number, resetEpochSeconds: number) {
    return {
      rateLimit: {
        get: jest.fn().mockResolvedValue({
          data: { rate: { remaining, reset: resetEpochSeconds } },
        }),
      },
    };
  }

  it('queries the rate limit once per ten calls', async () => {
    const client = makeClient(5000, Math.floor(Date.now() / 1000) + 60);

    await callTenTimes(client);

    expect(client.rateLimit.get).toHaveBeenCalledTimes(1);
  });

  it('does not pause when remaining requests are above the threshold', async () => {
    const client = makeClient(5000, Math.floor(Date.now() / 1000) + 60);
    const setTimeoutSpy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((cb: () => void) => {
        cb();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);

    await callTenTimes(client);

    // No sleep should be scheduled when we are well under the limit.
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('pauses until reset when remaining requests are below the threshold', async () => {
    const resetEpochSeconds = Math.floor(Date.now() / 1000) + 60;
    const client = makeClient(10, resetEpochSeconds);
    const delays: number[] = [];
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((cb: () => void, ms?: number) => {
        delays.push(ms ?? 0);
        cb();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);

    await callTenTimes(client);

    expect(delays).toHaveLength(1);
    // Waits until reset plus a 1s buffer; allow slack for clock drift in-test.
    expect(delays[0]).toBeGreaterThan(0);
  });

  it('does not throw when the rate limit lookup fails', async () => {
    const client = {
      rateLimit: {
        get: jest.fn().mockRejectedValue(new Error('network down')),
      },
    };

    await expect(callTenTimes(client)).resolves.toBeDefined();
    expect(client.rateLimit.get).toHaveBeenCalledTimes(1);
  });
});
