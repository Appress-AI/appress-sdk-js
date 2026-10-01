import { AppressError } from './errors.js';
import { HttpClient, type HttpRequest } from './core/http.js';
import { Generations } from './resources/generations.js';
import { LiveTranscriptions } from './resources/live-transcriptions.js';

export interface ClientOptions {
  /** API key. Defaults to the `APPRESS_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to `https://api.appress.ai`; can also be set with `APPRESS_BASE_URL`. */
  baseURL?: string;
  /** Per-request timeout (ms). Defaults to 60 s; 30 min for file uploads. */
  timeoutMs?: number;
  /** Maximum retries on 408/429/transient 5xx and network errors. Defaults to 4. */
  maxRetries?: number;
  /** Custom `fetch` (proxy, tests). Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Headers added to every request. */
  defaultHeaders?: Record<string, string>;
  /**
   * An API key shipped to a browser can be read by anyone, so the SDK refuses to
   * run in a browser by default. Set `true` only if you know what you are doing.
   */
  dangerouslyAllowBrowser?: boolean;
}

export const DEFAULT_BASE_URL = 'https://api.appress.ai';

export class Appress {
  readonly generations: Generations;
  readonly liveTranscriptions: LiveTranscriptions;
  private readonly http: HttpClient;

  constructor(options: ClientOptions = {}) {
    const env = typeof process !== 'undefined' ? process.env : {};
    const apiKey = options.apiKey ?? env['APPRESS_API_KEY'];
    if (!apiKey) {
      throw new AppressError('Missing API key: pass `new Appress({ apiKey })` or set the APPRESS_API_KEY environment variable');
    }
    if (isBrowser() && !options.dangerouslyAllowBrowser) {
      throw new AppressError(
        'The Appress SDK cannot run in a browser: it would expose your API key. Call the API from your own backend.',
      );
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new AppressError('Global fetch is not available; Node.js 20.3+ is required');

    this.http = new HttpClient({
      apiKey,
      baseURL: options.baseURL ?? env['APPRESS_BASE_URL'] ?? DEFAULT_BASE_URL,
      timeoutMs: options.timeoutMs ?? 60_000,
      maxRetries: options.maxRetries ?? 4,
      fetch: fetchImpl.bind(globalThis),
      defaultHeaders: options.defaultHeaders ?? {},
    });
    this.generations = new Generations(this.http);
    this.liveTranscriptions = new LiveTranscriptions(this.http);
  }

  /**
   * Raw request for an endpoint without a typed helper. The `{ success, data }`
   * envelope is unwrapped; errors and retries behave like the other methods.
   */
  request<T = unknown>(req: HttpRequest): Promise<T> {
    return this.http.request<T>(req);
  }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof (window as { document?: unknown }).document !== 'undefined';
}
