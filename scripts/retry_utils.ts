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
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 8000, // 8 seconds
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
function isRetryableError(error: any, retryableErrors: string[]): boolean {
  if (!error) return false;

  const errorString = error.toString();
  const errorName = error.name || "";
  const errorCode = String(error.code || "");
  const errorStatus = String(error.status || "");

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
  let lastError: any;

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
