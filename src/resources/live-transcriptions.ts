import { randomUUID } from 'node:crypto';
import { sleep, type HttpClient } from '../core/http.js';
import type {
  ActiveLiveTranscription,
  IdempotentRequestOptions,
  LiveTranscription,
  LiveTranscriptionCreateParams,
  LiveTranscriptionExtendOptions,
  LiveTranscriptionExtendParams,
  LiveTranscriptionOptions,
  LiveTranscriptionState,
  LiveTranscriptionTurn,
  RequestOptions,
} from '../types.js';

export const TERMINAL_LIVE_STATES: readonly LiveTranscriptionState[] = ['COMPLETED', 'FAILED'];

export interface StreamTurnsOptions extends RequestOptions {
  /** Sorgu aralığı (ms). Varsayılan 2000. */
  pollIntervalMs?: number;
  /**
   * `true` ise henüz kesinleşmemiş (`isFinal: false`) turlar da metni her
   * değiştiğinde yayınlanır. Varsayılan `false`: yalnız kesinleşen turlar.
   */
  includePartial?: boolean;
  /** Her sorguda oturumun son hâliyle çağrılır (durum takibi için). */
  onSession?: (session: LiveTranscription) => void;
}

export class LiveTranscriptions {
  constructor(private readonly http: HttpClient) {}

  /** Seçilebilir yayın süreleri ve her biri için rezerve edilecek tutar. */
  options(options: RequestOptions = {}): Promise<LiveTranscriptionOptions> {
    return this.http.request({ ...options, method: 'GET', path: '/v1/live-transcriptions/options' });
  }

  /** Bu API anahtarının aktif oturumları. */
  active(options: RequestOptions = {}): Promise<ActiveLiveTranscription[]> {
    return this.http.request({ ...options, method: 'GET', path: '/v1/live-transcriptions/active' });
  }

  /** Canlı yayın transkripsiyonu başlatır (`202 Accepted`). Süre kadar tutar rezerve edilir. */
  create(params: LiveTranscriptionCreateParams, options: IdempotentRequestOptions = {}): Promise<LiveTranscription> {
    const { idempotencyKey = randomUUID(), ...requestOptions } = options;
    return this.http.request({
      ...requestOptions,
      method: 'POST',
      path: '/v1/live-transcriptions',
      body: params,
      idempotencyKey,
    });
  }

  /** Oturumu ve şimdiye kadarki tüm turları getirir. */
  retrieve(id: string, options: RequestOptions = {}): Promise<LiveTranscription> {
    return this.http.request({ ...options, method: 'GET', path: `/v1/live-transcriptions/${encodeURIComponent(id)}` });
  }

  /** Aktif oturumu durdurur. Zaten bitmiş oturumda değişiklik yapmadan son hâlini döner. */
  stop(id: string, options: RequestOptions = {}): Promise<LiveTranscription> {
    return this.http.request({
      ...options,
      method: 'POST',
      path: `/v1/live-transcriptions/${encodeURIComponent(id)}/stop`,
    });
  }

  /** Oturumun uzatılabileceği toplam süreler ve ek rezervasyon tutarları. */
  extendOptions(id: string, options: RequestOptions = {}): Promise<LiveTranscriptionExtendOptions> {
    return this.http.request({
      ...options,
      method: 'GET',
      path: `/v1/live-transcriptions/${encodeURIComponent(id)}/extend-options`,
    });
  }

  /** Oturumun toplam süresini uzatır; fark kadar ek tutar rezerve edilir. */
  extend(
    id: string,
    params: LiveTranscriptionExtendParams,
    options: IdempotentRequestOptions = {},
  ): Promise<LiveTranscription> {
    const { idempotencyKey = randomUUID(), ...requestOptions } = options;
    return this.http.request({
      ...requestOptions,
      method: 'POST',
      path: `/v1/live-transcriptions/${encodeURIComponent(id)}/extend`,
      body: params,
      idempotencyKey,
    });
  }

  /**
   * Oturumu sorgulayarak yeni turları sırayla yayınlar; oturum `COMPLETED`
   * veya `FAILED` olunca biter. Döngüden `break` ile çıkmak oturumu
   * DURDURMAZ — durdurmak için `stop()` çağır.
   *
   * ```ts
   * for await (const turn of client.liveTranscriptions.streamTurns(session.id)) {
   *   console.log(turn.speaker, turn.text);
   * }
   * ```
   */
  async *streamTurns(id: string, options: StreamTurnsOptions = {}): AsyncGenerator<LiveTranscriptionTurn> {
    const { pollIntervalMs = 2_000, includePartial = false, onSession, ...requestOptions } = options;
    // turnId → son yayınlanan metin; kesinleşen turlar bir daha yayınlanmaz.
    const emitted = new Map<string, { text: string; isFinal: boolean }>();

    for (;;) {
      const session = await this.retrieve(id, requestOptions);
      onSession?.(session);
      for (const turn of session.turns) {
        const previous = emitted.get(turn.turnId);
        if (previous?.isFinal) continue;
        if (!turn.isFinal && (!includePartial || previous?.text === turn.text)) continue;
        emitted.set(turn.turnId, { text: turn.text, isFinal: turn.isFinal });
        yield turn;
      }
      if (TERMINAL_LIVE_STATES.includes(session.state)) return;
      await sleep(pollIntervalMs, requestOptions.signal);
    }
  }
}
