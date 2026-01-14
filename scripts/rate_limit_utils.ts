/**
 * Rate Limit Utilities
 * Handles GitHub API rate limiting
 */

import { Octokit } from "@octokit/rest";

const RATE_LIMIT_THRESHOLD = 100; // Pause when remaining requests < this
const RATE_LIMIT_CHECK_INTERVAL = 10; // Check every N requests

let requestCount = 0;

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check rate limit and pause if necessary
 */
export async function checkRateLimit(client: Octokit): Promise<void> {
  requestCount++;

  // Only check every N requests to avoid overhead
  if (requestCount % RATE_LIMIT_CHECK_INTERVAL !== 0) {
    return;
  }

  try {
    const { data: rateLimit } = await client.rateLimit.get();
    const remaining = rateLimit.rate.remaining;
    const resetTime = new Date(rateLimit.rate.reset * 1000);

    console.log(`Rate limit: ${remaining} requests remaining`);

    if (remaining < RATE_LIMIT_THRESHOLD) {
      const now = new Date();
      const waitMs = resetTime.getTime() - now.getTime();

      if (waitMs > 0) {
        console.log(
          `⚠️  Approaching rate limit. Pausing for ${Math.ceil(
            waitMs / 1000
          )} seconds...`
        );
        await sleep(waitMs + 1000); // Add 1 second buffer
        console.log("✓ Resuming after rate limit reset");
      }
    }
  } catch (error) {
    console.error("Error checking rate limit:", error);
    // Don't throw - continue processing
  }
}

/**
 * Process items in batches with delays
 */
export async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  delayMs: number = 1000
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        items.length / batchSize
      )} (${batch.length} items)`
    );

    // Process batch items in parallel
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // Add delay between batches (except for last batch)
    if (i + batchSize < items.length) {
      console.log(`Waiting ${delayMs}ms before next batch...`);
      await sleep(delayMs);
    }
  }

  return results;
}
