import { AppressError } from './errors.js';
import { HttpClient, type HttpRequest } from './core/http.js';
import { Generations } from './resources/generations.js';
import { LiveTranscriptions } from './resources/live-transcriptions.js';

export interface ClientOptions {
  /** API anahtarı. Verilmezse `APPRESS_API_KEY` ortam değişkeni okunur. */
  apiKey?: string;
  /** Varsayılan `https://api.appress.ai`; `APPRESS_BASE_URL` ile de verilebilir. */
  baseURL?: string;
  /** İstek başına zaman aşımı (ms). Varsayılan 60 sn; dosya yüklemelerinde 30 dk. */
  timeoutMs?: number;
  /** 408/429/5xx-geçici ve ağ hatalarında en fazla yeniden deneme. Varsayılan 4. */
  maxRetries?: number;
  /** Özel `fetch` (proxy, test). Varsayılan global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Her isteğe eklenecek başlıklar. */
  defaultHeaders?: Record<string, string>;
  /**
   * API anahtarı tarayıcıya gömülürse herkes tarafından okunabilir; SDK bu
   * yüzden tarayıcıda varsayılan olarak çalışmaz. Ne yaptığından eminsen `true`.
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
      throw new AppressError('API anahtarı yok: `new Appress({ apiKey })` ver veya APPRESS_API_KEY ortam değişkenini tanımla');
    }
    if (isBrowser() && !options.dangerouslyAllowBrowser) {
      throw new AppressError(
        'Appress SDK tarayıcıda çalıştırılamaz: API anahtarı sızar. İstekleri kendi backend’inden gönder.',
      );
    }
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new AppressError('Global fetch bulunamadı; Node.js 20+ gerekir');

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
   * Tipli yardımcısı olmayan bir uca ham istek. Zarf (`{ success, data }`)
   * açılır, hata/yeniden deneme davranışı diğer metotlarla aynıdır.
   */
  request<T = unknown>(req: HttpRequest): Promise<T> {
    return this.http.request<T>(req);
  }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof (window as { document?: unknown }).document !== 'undefined';
}
