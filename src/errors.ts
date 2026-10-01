// Hata hiyerarşisi. Backend hata zarfı:
// `{ success: false, statusCode, message, code?, nextAction? }`.
// `code` alanı makine tarafından okunacak sabittir; `message` Türkçe ve
// kullanıcıya gösterilebilir metindir, sözleşme değildir.

/** Backend'in `/v1` altında döndürebildiği sabit hata kodları. */
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

/** SDK'nın attığı tüm hataların ortak tabanı. */
export class AppressError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Sunucunun HTTP hata yanıtı döndürdüğü durumlar. */
export class APIError extends AppressError {
  readonly status: number;
  /** Bilinen bir sabitse `AppressErrorCode`; yeni backend sürümleri yeni değer ekleyebilir. */
  readonly code: AppressErrorCode | (string & {}) | undefined;
  readonly headers: Headers;
  /** Ham yanıt gövdesi (JSON değilse metin). */
  readonly body: unknown;

  constructor(status: number, message: string, code: string | undefined, headers: Headers, body: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
    this.body = body;
  }
}

/** 400 — doğrulama hatası. İsteği düzelt; körlemesine tekrar etme. */
export class BadRequestError extends APIError {}
/** 401 — eksik, geçersiz veya iptal edilmiş API anahtarı. */
export class AuthenticationError extends APIError {}
/** 403 — işlem için yetki veya bakiye yok. */
export class PermissionDeniedError extends APIError {}
/** 403 `INSUFFICIENT_API_CREDIT` — API bakiyesi yetersiz. Ücret alınmadı; cüzdana bakiye yükle. */
export class InsufficientCreditError extends PermissionDeniedError {}
/** 404 — üretim veya oturum bulunamadı (ya da başka bir anahtara/tenant'a ait). */
export class NotFoundError extends APIError {}
/** 409 — çakışma. Ayrıntı için `code` alanına bak. */
export class ConflictError extends APIError {}
/** 409 `IDEMPOTENCY_KEY_CONFLICT` — aynı anahtar farklı gövdeyle kullanıldı. */
export class IdempotencyConflictError extends ConflictError {}
/** 409 `CONCURRENT_GENERATION_LIMIT` — paketinin eşzamanlı üretim limiti dolu. */
export class ConcurrencyLimitError extends ConflictError {}
/** 413 — dosya veya istek gövdesi sınırı aşıldı. */
export class PayloadTooLargeError extends APIError {}
/** 429 — hız limiti. SDK otomatik tekrar dener; denemeler tükenirse atılır. */
export class RateLimitError extends APIError {
  /** Sunucunun önerdiği bekleme süresi (saniye), varsa. */
  get retryAfterSeconds(): number | undefined {
    return parseRetryAfterSeconds(this.headers.get('retry-after'));
  }
}
/** 5xx — sunucu veya bağımlı servis hatası. */
export class InternalServerError extends APIError {}

/** Ağ hatası; istek sunucuya ulaşamadı veya yanıt alınamadı. */
export class APIConnectionError extends AppressError {}
/** İstek zaman aşımına uğradı. */
export class APITimeoutError extends APIConnectionError {}
/** İstek çağıranın `AbortSignal`'i ile iptal edildi. */
export class APIUserAbortError extends AppressError {}

/** `waitForCompletion` belirlenen süre içinde son duruma ulaşmadı. İş sunucuda devam ediyor olabilir. */
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
