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
  /** Polling interval (ms). Defaults to 2000. */
  pollIntervalMs?: number;
  /**
   * When `true`, turns that are not final yet (`isFinal: false`) are also
   * yielded whenever their text changes. Defaults to `false`: final turns only.
   */
  includePartial?: boolean;
  /** Called with the latest session on every poll (for state tracking). */
  onSession?: (session: LiveTranscription) => void;
}

export class LiveTranscriptions {
  constructor(private readonly http: HttpClient) {}

  /** Available durations and the amount reserved for each. */
  options(options: RequestOptions = {}): Promise<LiveTranscriptionOptions> {
    return this.http.request({ ...options, method: 'GET', path: '/v1/live-transcriptions/options' });
  }

  /** Active sessions of this API key. */
  active(options: RequestOptions = {}): Promise<ActiveLiveTranscription[]> {
    return this.http.request({ ...options, method: 'GET', path: '/v1/live-transcriptions/active' });
  }

  /** Starts a live transcription (`202 Accepted`). The amount for the chosen duration is reserved. */
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

  /** Returns the session with all turns so far. */
  retrieve(id: string, options: RequestOptions = {}): Promise<LiveTranscription> {
    return this.http.request({ ...options, method: 'GET', path: `/v1/live-transcriptions/${encodeURIComponent(id)}` });
  }

  /** Stops an active session. For a session that already ended, returns it unchanged. */
  stop(id: string, options: RequestOptions = {}): Promise<LiveTranscription> {
    return this.http.request({
      ...options,
      method: 'POST',
      path: `/v1/live-transcriptions/${encodeURIComponent(id)}/stop`,
    });
  }

  /** Total durations the session can be extended to, with the additional reservation for each. */
  extendOptions(id: string, options: RequestOptions = {}): Promise<LiveTranscriptionExtendOptions> {
    return this.http.request({
      ...options,
      method: 'GET',
      path: `/v1/live-transcriptions/${encodeURIComponent(id)}/extend-options`,
    });
  }

  /** Extends the session's total duration; the difference is reserved additionally. */
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
   * Polls the session and yields new turns in order; ends when the session is
   * `COMPLETED` or `FAILED`. Breaking out of the loop does NOT stop the
   * session — call `stop()` for that.
   *
   * ```ts
   * for await (const turn of client.liveTranscriptions.streamTurns(session.id)) {
   *   console.log(turn.speaker, turn.text);
   * }
   * ```
   */
  async *streamTurns(id: string, options: StreamTurnsOptions = {}): AsyncGenerator<LiveTranscriptionTurn> {
    const { pollIntervalMs = 2_000, includePartial = false, onSession, ...requestOptions } = options;
    // turnId → last yielded text; final turns are never yielded again.
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
