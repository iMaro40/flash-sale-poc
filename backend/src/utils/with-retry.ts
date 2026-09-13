export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 50;
const DEFAULT_MAX_DELAY_MS = 1000;
const DEFAULT_FACTOR = 2;

// TO DO: Change to reusable isRetryable param

export const isTransientError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  if (
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  ) {
    const statusCode = (error as { statusCode: number }).statusCode;
    if (statusCode >= 400 && statusCode < 500) {
      return false;
    }
  }

  if (
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    const code = (error as { code: string }).code;
    const retryablePgCodes = [
      "40P01", // deadlock_detected
      "40001", // serialization_failure
      "08000", // connection_exception
      "08003", // connection_does_not_exist
      "08006", // connection_failure
      "57P01", // admin_shutdown
      "53300", // too_many_connections
    ];

    const retryableNetworkCodes = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EPIPE",
      "EAI_AGAIN",
    ];

    if (
      retryablePgCodes.includes(code) ||
      retryableNetworkCodes.includes(code)
    ) {
      return true;
    }
  }

  return true;
};

export const calculateBackoffDelay = (
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  factor: number,
  jitter: boolean,
): number => {
  const calculatedDelay = Math.min(
    maxDelayMs,
    baseDelayMs * Math.pow(factor, attempt - 1),
  );

  if (!jitter) {
    return calculatedDelay;
  }

  return Math.floor(Math.random() * calculatedDelay);
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    factor = DEFAULT_FACTOR,
    jitter = true,
    isRetryable = isTransientError,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }

      const delayMs = calculateBackoffDelay(
        attempt,
        baseDelayMs,
        maxDelayMs,
        factor,
        jitter,
      );

      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
