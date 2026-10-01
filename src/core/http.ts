import {
  APIConnectionError,
  APITimeoutError,
  APIUserAbortError,
  AppressError,
  createAPIError,
  parseRetryAfterSeconds,
} from '../errors.js';
import { VERSION } from '../version.js';

export type HttpMethod = 'GET' | 'POST';

export interface HttpClientOptions {
  apiKey: string;
  baseURL: string;
  timeoutMs: number;
  maxRetries: number;
  fetch: typeof globalThis.fetch;
  defaultHeaders: Record<string, string>;
}

export interface HttpRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON gövdesi veya her denemede yeniden üretilen multipart gövde. */
  body?: unknown;
  formData?: () => FormData | Promise<FormData>;
  idempotencyKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

const RETRYABLE_STATUS = new Set([408, 429, 502, 503, 504]);
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 16_000;
const MAX_RETRY_AFTER_MS = 60_000;

export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  async request<T>(req: HttpRequest): Promise<T> {
    const maxRetries = req.maxRetries ?? this.options.maxRetries;
    for (let attempt = 0; ; attempt += 1) {
      const remaining = maxRetries - attempt;
      try {
        return await this.send<T>(req);
      } catch (error) {
        if (remaining <= 0 || !isRetryable(error)) throw error;
        await sleep(retryDelayMs(error, attempt), req.signal);
      }
    }
  }

  private async send<T>(req: HttpRequest): Promise<T> {
    const url = this.buildURL(req.path, req.query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.options.apiKey}`,
      'User-Agent': `appress-sdk-js/${VERSION} node/${process.versions.node}`,
      ...this.options.defaultHeaders,
      ...req.headers,
    };
    // Aynı mantıksal istek için her denemede aynı anahtar gider: sunucu
    // ikinci denemeyi ilk kaydın tekrarı olarak tanır, çift ücret çıkmaz.
    if (req.idempotencyKey) headers['Idempotency-Key'] = req.idempotencyKey;

    let body: BodyInit | undefined;
    if (req.formData) {
      body = await req.formData();
    } else if (req.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.body);
    }

    const timeoutMs = req.timeoutMs ?? this.options.timeoutMs;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;

    let response: Response;
    try {
      response = await this.options.fetch(url, { method: req.method, headers, body, signal });
    } catch (error) {
      if (req.signal?.aborted) throw new APIUserAbortError('İstek iptal edildi', { cause: error });
      if (timeoutSignal.aborted) {
        throw new APITimeoutError(`İstek ${timeoutMs} ms içinde tamamlanmadı`, { cause: error });
      }
      throw new APIConnectionError('Appress API’ye bağlanılamadı', { cause: error });
    }

    const payload = await readBody(response);
    if (!response.ok) throw createAPIError(response.status, payload, response.headers);

    if (isSuccessEnvelope(payload)) return payload.data as T;
    return payload as T;
  }

  private buildURL(path: string, query?: HttpRequest['query']): string {
    const url = new URL(path.replace(/^\//, ''), this.options.baseURL.replace(/\/?$/, '/'));
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isSuccessEnvelope(value: unknown): value is { success: true; data: unknown } {
  return typeof value === 'object' && value !== null && (value as { success?: unknown }).success === true && 'data' in value;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof APIUserAbortError) return false;
  if (error instanceof APIConnectionError) return true;
  if (error instanceof AppressError && 'status' in error) {
    return RETRYABLE_STATUS.has((error as { status: number }).status);
  }
  return false;
}

function retryDelayMs(error: unknown, attempt: number): number {
  const headers = (error as { headers?: Headers }).headers;
  const retryAfter = parseRetryAfterSeconds(headers?.get('retry-after') ?? null);
  if (retryAfter !== undefined) return Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
  const base = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
  // Tam jitter yerine ±25%: çok sayıda istemci aynı anda yeniden denemesin,
  // ama bekleme de öngörülebilir kalsın.
  return base * (0.75 + Math.random() * 0.5);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new APIUserAbortError('İstek iptal edildi'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new APIUserAbortError('İstek iptal edildi'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
