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

/** A generation in one of these statuses never changes again. */
export const TERMINAL_GENERATION_STATUSES: readonly GenerationStatus[] = ['COMPLETED', 'ERROR', 'CANCELLED'];

/** Default timeout for file uploads: large audio files can take minutes. */
const UPLOAD_TIMEOUT_MS = 30 * 60_000;

export interface WaitOptions extends RequestOptions {
  /** Initial polling interval (ms). Defaults to 2000. */
  pollIntervalMs?: number;
  /** Upper bound of the polling interval (ms). Defaults to 10000. */
  maxPollIntervalMs?: number;
  /** Total wait limit (ms). Defaults to 30 minutes; `Infinity` for no limit. */
  waitTimeoutMs?: number;
  /** Called after every poll, e.g. to show progress. */
  onProgress?: (generation: Generation) => void;
}

export class Generations {
  constructor(private readonly http: HttpClient) {}

  /**
   * Starts an asynchronous generation (`202 Accepted`). Use `retrieve` or
   * `waitForCompletion` for the result. An `Idempotency-Key` is generated
   * automatically and kept across retries.
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
          // In multipart bodies featureParams is sent as a JSON string; the backend parses it.
          form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
        form.append('file', blob, fileName);
        return form;
      },
    });
  }

  /** Returns the current status of a generation, and its result once completed. */
  retrieve(id: string, options: RequestOptions = {}): Promise<Generation> {
    return this.http.request<Generation>({
      ...options,
      method: 'GET',
      path: `/v1/generations/${encodeURIComponent(id)}`,
    });
  }

  /** Lists the tenant's API generations, paginated (`{ items, total }`). */
  list(params: GenerationListParams = {}, options: RequestOptions = {}): Promise<GenerationList> {
    return this.http.request<GenerationList>({
      ...options,
      method: 'GET',
      path: '/v1/generations',
      query: { ...params },
    });
  }

  /** Walks every page in order: `for await (const g of client.generations.iterate())`. */
  async *iterate(params: Omit<GenerationListParams, 'skip'> = {}, options: RequestOptions = {}): AsyncGenerator<Generation> {
    const take = params.take ?? 100;
    for (let skip = 0; ; skip += take) {
      const page = await this.list({ ...params, take, skip }, options);
      yield* page.items;
      if (page.items.length < take || skip + page.items.length >= page.total) return;
    }
  }

  /**
   * Polls until the generation is `COMPLETED`, `ERROR` or `CANCELLED` and returns
   * it. `ERROR`/`CANCELLED` do not throw: check `status` and `error`. Throws
   * `WaitTimeoutError` when the wait limit is reached; the job may still be
   * running on the server and can be awaited again with the same ID.
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
        throw new WaitTimeoutError(`Generation did not finish within ${waitTimeoutMs} ms (last status: ${generation.status})`, id);
      }
      await sleep(Math.min(interval, remaining), requestOptions.signal);
      // Long jobs are polled less often over time: 2 → 3 → 4.5 → … → 10 s.
      interval = Math.min(interval * 1.5, maxPollIntervalMs);
    }
  }

  /** Shortcut for `create` followed by `waitForCompletion`. */
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
