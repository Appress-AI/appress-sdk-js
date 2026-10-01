import { Appress, type ClientOptions } from '../src/index.js';

export interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body: BodyInit | null | undefined;
}

type Responder = (req: RecordedRequest, index: number) => Response | Promise<Response>;

/** Sırayla verilen yanıtları dönen, istekleri kaydeden sahte fetch. */
export function mockFetch(...responders: Responder[]) {
  const requests: RecordedRequest[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const req: RecordedRequest = {
      url: new URL(String(input)),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body,
    };
    requests.push(req);
    const responder = responders[Math.min(requests.length - 1, responders.length - 1)];
    if (!responder) throw new Error('beklenmeyen istek');
    return responder(req, requests.length - 1);
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

export function ok(data: unknown, status = 200, headers: Record<string, string> = {}): Responder {
  return () =>
    new Response(JSON.stringify({ success: true, data }), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
}

export function fail(status: number, message: string, code?: string, headers: Record<string, string> = {}): Responder {
  return () =>
    new Response(JSON.stringify({ success: false, statusCode: status, message, ...(code ? { code } : {}) }), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
}

export function client(fetch: typeof globalThis.fetch, options: ClientOptions = {}) {
  return new Appress({ apiKey: 'apr_live_test', baseURL: 'https://api.test', fetch, ...options });
}

export function generation(overrides: Record<string, unknown> = {}) {
  return {
    id: '3cf8a05e-662c-4f18-abd5-14f5c1a5f91d',
    featureType: 'NEWS',
    inputType: 'TEXT',
    status: 'PENDING',
    title: null,
    progress: { step: null, percent: null },
    estimatedCostUsd: '0.200000',
    actualCostUsd: null,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...overrides,
  };
}

export function liveSession(overrides: Record<string, unknown> = {}) {
  return {
    id: '9b1f7d2a-1111-4c22-8a33-000000000001',
    url: 'https://www.youtube.com/watch?v=x',
    generationId: '9b1f7d2a-1111-4c22-8a33-000000000002',
    state: 'STREAMING',
    platform: 'youtube',
    expectedLanguage: 'tr',
    maxDurationMinutes: 120,
    expiresAt: null,
    lastSequence: 0,
    mediaTitle: null,
    failureCode: null,
    failureMessage: null,
    turns: [],
    createdAt: '2026-10-01T09:00:00.000Z',
    startedAt: null,
    completedAt: null,
    reservedCostUsd: '1.000000',
    ...overrides,
  };
}
