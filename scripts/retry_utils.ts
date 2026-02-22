/**
 * Retry utilities with exponential backoff
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number; // in milliseconds
  maxDelay?: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: parseInt(process.env.MAX_RETRIES || "0", 10) || Infinity,
  baseDelay: parseInt(process.env.RETRY_BASE_DELAY_MS || "1000", 10),
  maxDelay: parseInt(process.env.RETRY_MAX_DELAY_MS || "0", 10) || Infinity,
  retryableErrors: ["ThrottlingException", "ServiceUnavailable", "ECONNRESET", "ETIMEDOUT"],
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = baseDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown, retryableErrors: string[]): boolean {
  if (!error) return false;

  const errorObj = error as Record<string, unknown>;
  const errorString = String(error);
  const errorName = String(errorObj.name || "");
  const errorCode = String(errorObj.code || "");
  const errorStatus = String(errorObj.status || "");

  return retryableErrors.some(
    (retryable) =>
      errorString.includes(retryable) ||
      errorName.includes(retryable) ||
      errorCode.includes(retryable) ||
      errorStatus.includes(retryable)
  );
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if this is the last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Don't retry if error is not retryable
      if (!isRetryableError(error, opts.retryableErrors)) {
        console.error(`Non-retryable error encountered:`, error);
        throw error;
      }

      const delay = calculateDelay(attempt, opts.baseDelay, opts.maxDelay);
      console.log(
        `Attempt ${attempt + 1} failed. Retrying in ${delay}ms... Error: ${error}`
      );

      await sleep(delay);
    }
  }

  console.error(`All ${opts.maxRetries + 1} attempts failed. Last error:`, lastError);
  throw lastError;
}
