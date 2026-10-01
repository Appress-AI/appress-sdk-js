import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Appress,
  AuthenticationError,
  BadRequestError,
  ConcurrencyLimitError,
  ConflictError,
  IdempotencyConflictError,
  InsufficientCreditError,
  InternalServerError,
  APIConnectionError,
  PermissionDeniedError,
  RateLimitError,
} from '../src/index.js';
import { client, fail, generation, mockFetch, ok } from './helpers.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('client setup', () => {
  it('throws a clear error without an API key', () => {
    vi.stubEnv('APPRESS_API_KEY', '');
    expect(() => new Appress({ fetch: mockFetch().fetch })).toThrow(/Missing API key/);
  });

  it('reads the key from the environment', async () => {
    vi.stubEnv('APPRESS_API_KEY', 'apr_live_env');
    const { fetch, requests } = mockFetch(ok(generation()));
    await new Appress({ fetch, baseURL: 'https://api.test' }).generations.retrieve('abc');
    expect(requests[0]!.headers.get('authorization')).toBe('Bearer apr_live_env');
  });

  it('refuses to run in a browser by default', () => {
    vi.stubGlobal('window', { document: {} });
    expect(() => client(mockFetch().fetch)).toThrow(/browser/);
    expect(() => client(mockFetch().fetch, { dangerouslyAllowBrowser: true })).not.toThrow();
  });
});

describe('request and response', () => {
  it('sends headers and unwraps the {success,data} envelope', async () => {
    const { fetch, requests } = mockFetch(ok(generation({ status: 'COMPLETED' })));
    const result = await client(fetch).generations.retrieve('3cf8a05e');
    expect(result.status).toBe('COMPLETED');
    const req = requests[0]!;
    expect(req.url.toString()).toBe('https://api.test/v1/generations/3cf8a05e');
    expect(req.headers.get('authorization')).toBe('Bearer apr_live_test');
    expect(req.headers.get('user-agent')).toMatch(/^appress-sdk-js\/\d/);
  });

  it('keeps a path prefix in baseURL', async () => {
    const { fetch, requests } = mockFetch(ok(generation()));
    await client(fetch, { baseURL: 'http://localhost:5173/backend' }).generations.retrieve('x');
    expect(requests[0]!.url.toString()).toBe('http://localhost:5173/backend/v1/generations/x');
  });

  it('adds list query parameters only when defined', async () => {
    const { fetch, requests } = mockFetch(ok({ items: [], total: 0 }));
    await client(fetch).generations.list({ take: 50, status: 'COMPLETED', featureType: undefined });
    expect(requests[0]!.url.search).toBe('?take=50&status=COMPLETED');
  });
});

describe('error mapping', () => {
  const cases = [
    [400, undefined, BadRequestError],
    [401, 'INVALID_API_KEY', AuthenticationError],
    [403, 'INSUFFICIENT_API_CREDIT', InsufficientCreditError],
    [403, undefined, PermissionDeniedError],
    [409, 'IDEMPOTENCY_KEY_CONFLICT', IdempotencyConflictError],
    [409, 'CONCURRENT_GENERATION_LIMIT', ConcurrencyLimitError],
    [409, 'LIVE_EXTENSION_IN_PROGRESS', ConflictError],
    [500, undefined, InternalServerError],
  ] as const;

  it.each(cases)('%i %s → right class, no retry', async (status, code, ErrorClass) => {
    const { fetch, requests } = mockFetch(fail(status, 'message', code));
    const error = await client(fetch).generations.retrieve('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorClass);
    expect(error).toMatchObject({ status, code, message: 'message' });
    expect(requests).toHaveLength(1);
  });

  it('a 403 credit error is both PermissionDenied and InsufficientCredit', async () => {
    const { fetch } = mockFetch(fail(403, 'Insufficient API credit', 'INSUFFICIENT_API_CREDIT'));
    const error = await client(fetch).generations.retrieve('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermissionDeniedError);
  });

  it('builds a useful message from a non-JSON error body', async () => {
    const { fetch } = mockFetch(() => new Response('Bad Gateway', { status: 502 }));
    const error = await client(fetch, { maxRetries: 0 }).generations.retrieve('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalServerError);
    expect(error).toMatchObject({ status: 502, message: 'Bad Gateway' });
  });
});

describe('retries', () => {
  it('on 429 waits for Retry-After and retries with the same Idempotency-Key', async () => {
    const { fetch, requests } = mockFetch(
      fail(429, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', { 'retry-after': '0' }),
      ok(generation(), 202),
    );
    const result = await client(fetch).generations.create({ featureType: 'NEWS', inputText: 'text' });
    expect(result.id).toBeDefined();
    expect(requests).toHaveLength(2);
    const [first, second] = requests;
    expect(first!.headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(second!.headers.get('idempotency-key')).toBe(first!.headers.get('idempotency-key'));
    expect(second!.body).toBe(first!.body);
  });

  it('throws the last error once retries are exhausted', async () => {
    const { fetch, requests } = mockFetch(fail(429, 'limit', 'RATE_LIMIT_EXCEEDED', { 'retry-after': '0' }));
    const error = await client(fetch, { maxRetries: 2 }).generations.retrieve('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterSeconds).toBe(0);
    expect(requests).toHaveLength(3);
  });

  it('retries network errors with exponential backoff', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetch = (async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ success: true, data: generation() }), { status: 200 });
    }) as typeof globalThis.fetch;
    const pending = client(fetch).generations.retrieve('x');
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toMatchObject({ id: generation().id });
    expect(calls).toBe(2);
  });

  it('a network error becomes APIConnectionError once retries are exhausted', async () => {
    const fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof globalThis.fetch;
    await expect(client(fetch, { maxRetries: 0 }).generations.retrieve('x')).rejects.toBeInstanceOf(APIConnectionError);
  });

  it('lets the caller pass its own Idempotency-Key', async () => {
    const { fetch, requests } = mockFetch(ok(generation(), 202));
    await client(fetch).generations.create({ featureType: 'NEWS', inputText: 'x' }, { idempotencyKey: 'order-42' });
    expect(requests[0]!.headers.get('idempotency-key')).toBe('order-42');
  });
});
