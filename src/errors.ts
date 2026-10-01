// Error hierarchy. Backend error envelope:
// `{ success: false, statusCode, message, code?, nextAction? }`.
// `code` is a stable machine-readable value; `message` is human-readable text
// (currently Turkish) and is not part of the contract.

/** Stable error codes the backend can return under `/v1`. */
export type AppressErrorCode =
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_CONFLICT'
  | 'IDEMPOTENCY_REQUEST_IN_PROGRESS'
  | 'CONCURRENT_GENERATION_LIMIT'
  | 'LIVE_SESSION_NOT_EXTENDABLE'
  | 'LIVE_EXTENSION_IN_PROGRESS'
  | 'LIVE_EXTENSION_INVALID'
  | 'INSUFFICIENT_API_CREDIT'
  | 'INVALID_API_KEY'
  | 'RATE_LIMIT_EXCEEDED'
  | 'RATE_LIMIT_UNAVAILABLE'
  | 'DB_POOL_SATURATED';

/** Base class of every error thrown by the SDK. */
export class AppressError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The server returned an HTTP error response. */
export class APIError extends AppressError {
  readonly status: number;
  /** An `AppressErrorCode` when known; newer backend versions may add values. */
  readonly code: AppressErrorCode | (string & {}) | undefined;
  readonly headers: Headers;
  /** Raw response body (text when it is not JSON). */
  readonly body: unknown;

  constructor(status: number, message: string, code: string | undefined, headers: Headers, body: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
    this.body = body;
  }
}

/** 400 — validation error. Fix the request; do not retry it blindly. */
export class BadRequestError extends APIError {}
/** 401 — missing, invalid or revoked API key. */
export class AuthenticationError extends APIError {}
/** 403 — not permitted or not enough credit. */
export class PermissionDeniedError extends APIError {}
/** 403 `INSUFFICIENT_API_CREDIT` — not enough API credit. Nothing was charged; top up the wallet. */
export class InsufficientCreditError extends PermissionDeniedError {}
/** 404 — generation or session not found (or it belongs to another key/tenant). */
export class NotFoundError extends APIError {}
/** 409 — conflict. See `code` for details. */
export class ConflictError extends APIError {}
/** 409 `IDEMPOTENCY_KEY_CONFLICT` — the same key was used with a different body. */
export class IdempotencyConflictError extends ConflictError {}
/** 409 `CONCURRENT_GENERATION_LIMIT` — your plan's concurrent generation limit is reached. */
export class ConcurrencyLimitError extends ConflictError {}
/** 413 — file or request body limit exceeded. */
export class PayloadTooLargeError extends APIError {}
/** 429 — rate limited. The SDK retries automatically and throws once retries are exhausted. */
export class RateLimitError extends APIError {
  /** Wait time suggested by the server (seconds), if any. */
  get retryAfterSeconds(): number | undefined {
    return parseRetryAfterSeconds(this.headers.get('retry-after'));
  }
}
/** 5xx — server or upstream service error. */
export class InternalServerError extends APIError {}

/** Network error: the request did not reach the server or no response arrived. */
export class APIConnectionError extends AppressError {}
/** The request timed out. */
export class APITimeoutError extends APIConnectionError {}
/** The request was aborted through the caller's `AbortSignal`. */
export class APIUserAbortError extends AppressError {}

/** `waitForCompletion` did not reach a final status in time. The job may still be running on the server. */
export class WaitTimeoutError extends AppressError {
  constructor(
    message: string,
    readonly resourceId: string,
  ) {
    super(message);
  }
}

export function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, (date - Date.now()) / 1000);
}

export function createAPIError(status: number, body: unknown, headers: Headers): APIError {
  const envelope = (typeof body === 'object' && body !== null ? body : {}) as {
    message?: unknown;
    code?: unknown;
  };
  const message =
    typeof envelope.message === 'string' && envelope.message
      ? envelope.message
      : typeof body === 'string' && body
        ? body
        : `HTTP ${status}`;
  const code = typeof envelope.code === 'string' ? envelope.code : undefined;
  const args = [status, message, code, headers, body] as const;

  switch (status) {
    case 400:
      return new BadRequestError(...args);
    case 401:
      return new AuthenticationError(...args);
    case 403:
      if (code === 'INSUFFICIENT_API_CREDIT') return new InsufficientCreditError(...args);
      return new PermissionDeniedError(...args);
    case 404:
      return new NotFoundError(...args);
    case 409:
      if (code === 'IDEMPOTENCY_KEY_CONFLICT') return new IdempotencyConflictError(...args);
      if (code === 'CONCURRENT_GENERATION_LIMIT') return new ConcurrencyLimitError(...args);
      return new ConflictError(...args);
    case 413:
      return new PayloadTooLargeError(...args);
    case 429:
      return new RateLimitError(...args);
    default:
      return status >= 500 ? new InternalServerError(...args) : new APIError(...args);
  }
}
