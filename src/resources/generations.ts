import { randomUUID } from 'node:crypto';
import { WaitTimeoutError } from '../errors.js';
import { toUploadable } from '../core/files.js';
import { sleep, type HttpClient } from '../core/http.js';
import type {
  Generation,
  GenerationCreateParams,
  GenerationList,
  GenerationListParams,
  GenerationStatus,
  IdempotentRequestOptions,
  RequestOptions,
} from '../types.js';

/** Bu durumlara ulaşan üretim bir daha değişmez. */
export const TERMINAL_GENERATION_STATUSES: readonly GenerationStatus[] = ['COMPLETED', 'ERROR', 'CANCELLED'];

/** Dosya yüklemelerinde varsayılan zaman aşımı: büyük ses dosyaları dakikalar sürebilir. */
const UPLOAD_TIMEOUT_MS = 30 * 60_000;

export interface WaitOptions extends RequestOptions {
  /** İlk sorgu aralığı (ms). Varsayılan 2000. */
  pollIntervalMs?: number;
  /** Aralığın çıkabileceği en yüksek değer (ms). Varsayılan 10000. */
  maxPollIntervalMs?: number;
  /** Toplam bekleme sınırı (ms). Varsayılan 30 dakika; `Infinity` ile sınırsız. */
  waitTimeoutMs?: number;
  /** Her sorgudan sonra çağrılır; ilerleme göstermek için. */
  onProgress?: (generation: Generation) => void;
}

export class Generations {
  constructor(private readonly http: HttpClient) {}

  /**
   * Asenkron üretim başlatır (`202 Accepted`). Sonuç için `retrieve` veya
   * `waitForCompletion` kullan. `Idempotency-Key` otomatik üretilir ve
   * yeniden denemelerde korunur.
   */
  async create(params: GenerationCreateParams, options: IdempotentRequestOptions = {}): Promise<Generation> {
    const idempotencyKey = options.idempotencyKey ?? randomUUID();
    const { file, ...fields } = params as GenerationCreateParams & { file?: Parameters<typeof toUploadable>[0] };

    if (file === undefined) {
      return this.http.request<Generation>({
        ...options,
        method: 'POST',
        path: '/v1/generations',
        body: fields,
        idempotencyKey,
      });
    }

    const { blob, fileName } = await toUploadable(file);
    return this.http.request<Generation>({
      timeoutMs: UPLOAD_TIMEOUT_MS,
      ...options,
      method: 'POST',
      path: '/v1/generations',
      idempotencyKey,
      formData: () => {
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) {
          if (value === undefined) continue;
          // multipart'ta featureParams JSON string olarak gider; backend çözümler.
          form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
        form.append('file', blob, fileName);
        return form;
      },
    });
  }

  /** Üretimin güncel durumunu ve tamamlandıysa sonucunu getirir. */
  retrieve(id: string, options: RequestOptions = {}): Promise<Generation> {
    return this.http.request<Generation>({
      ...options,
      method: 'GET',
      path: `/v1/generations/${encodeURIComponent(id)}`,
    });
  }

  /** Tenant'ın API üretimlerini sayfalı listeler (`{ items, total }`). */
  list(params: GenerationListParams = {}, options: RequestOptions = {}): Promise<GenerationList> {
    return this.http.request<GenerationList>({
      ...options,
      method: 'GET',
      path: '/v1/generations',
      query: { ...params },
    });
  }

  /** Tüm sayfaları sırayla dolaşır: `for await (const g of client.generations.iterate())`. */
  async *iterate(params: Omit<GenerationListParams, 'skip'> = {}, options: RequestOptions = {}): AsyncGenerator<Generation> {
    const take = params.take ?? 100;
    for (let skip = 0; ; skip += take) {
      const page = await this.list({ ...params, take, skip }, options);
      yield* page.items;
      if (page.items.length < take || skip + page.items.length >= page.total) return;
    }
  }

  /**
   * Üretim `COMPLETED`, `ERROR` veya `CANCELLED` olana kadar sorgular ve son
   * hâlini döndürür. `ERROR`/`CANCELLED` hata atmaz: `status` ve `error`
   * alanını kontrol et. Süre dolarsa `WaitTimeoutError` atılır; iş sunucuda
   * devam ediyor olabilir, aynı kimlikle tekrar beklenebilir.
   */
  async waitForCompletion(id: string, options: WaitOptions = {}): Promise<Generation> {
    const { pollIntervalMs = 2_000, maxPollIntervalMs = 10_000, waitTimeoutMs = 30 * 60_000, onProgress, ...requestOptions } =
      options;
    const deadline = Date.now() + waitTimeoutMs;
    let interval = pollIntervalMs;

    for (;;) {
      const generation = await this.retrieve(id, requestOptions);
      onProgress?.(generation);
      if (TERMINAL_GENERATION_STATUSES.includes(generation.status)) return generation;

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new WaitTimeoutError(`Üretim ${waitTimeoutMs} ms içinde tamamlanmadı (son durum: ${generation.status})`, id);
      }
      await sleep(Math.min(interval, remaining), requestOptions.signal);
      // Uzun işlerde sorgu sıklığı kademeli azalır: 2 → 3 → 4.5 → … → 10 sn.
      interval = Math.min(interval * 1.5, maxPollIntervalMs);
    }
  }

  /** `create` + `waitForCompletion` kısayolu. */
  async createAndWait(
    params: GenerationCreateParams,
    options: IdempotentRequestOptions & WaitOptions = {},
  ): Promise<Generation> {
    const { pollIntervalMs, maxPollIntervalMs, waitTimeoutMs, onProgress, ...requestOptions } = options;
    const created = await this.create(params, requestOptions);
    const { idempotencyKey: _ignored, ...pollOptions } = requestOptions;
    return this.waitForCompletion(created.id, {
      ...pollOptions,
      pollIntervalMs,
      maxPollIntervalMs,
      waitTimeoutMs,
      onProgress,
    });
  }
}
