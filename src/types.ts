// TypeScript types for the Appress public API v1.
// Source of truth: the backend OpenAPI document (`GET /api-reference/openapi.json`).
// When response shapes change there, update this file; `npm run check:contract`
// reports the drift.

import type {
  FEATURE_TYPES,
  GENERATION_STATUSES,
  INPUT_TYPES,
  LIVE_TRANSCRIPTION_PLATFORMS,
  LIVE_TRANSCRIPTION_STATES,
  NEWS_CATEGORIES,
  TONES,
} from './constants.js';

export type FeatureType = (typeof FEATURE_TYPES)[number];

/** Features that can be started through `/v1/generations` (everything except live transcription). */
export type GenerationFeatureType = Exclude<FeatureType, 'LIVE_TRANSCRIPTION'>;

export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export type InputType = (typeof INPUT_TYPES)[number];

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export type Tone = (typeof TONES)[number];

// ---------------------------------------------------------------------------
// featureParams
// ---------------------------------------------------------------------------

export interface TranscriptionParams {
  /** Source audio language. Defaults to `tr`. */
  stt_lang?: string;
  /** When set, the transcript is translated into this language. */
  translate_lang?: string;
  title?: string;
}

export interface DiarizationParams {
  /** Expected number of speakers (at least 1). */
  speakers_expected?: number;
  title?: string;
}

export interface ProofreadingParams {
  /** `tr` (default) or `intl` for automatic language detection. */
  language?: 'tr' | 'intl';
  title?: string;
}

interface DescriptionModeFields {
  tone?: Tone;
  news_category?: NewsCategory;
  speaker?: string;
  title?: string;
  date?: string;
  location?: string;
  topic?: string;
  notes?: string;
}

export interface EventDetails {
  description: string;
  news_category: NewsCategory;
  tone: Tone;
  /** Output language, e.g. `tr`. */
  language: string;
  date?: string;
  location?: string;
}

export type NewsParams =
  | ({ mode?: 'description'; news_lang?: string } & DescriptionModeFields)
  | { mode: 'event'; event: EventDetails };

export type PressReleaseParams =
  | ({ mode?: 'description'; press_release_lang?: string } & DescriptionModeFields)
  | { mode: 'event'; event: EventDetails };

export interface FeatureParamsMap {
  TRANSCRIPTION: TranscriptionParams;
  DIARIZATION: DiarizationParams;
  PROOFREADING: ProofreadingParams;
  NEWS: NewsParams;
  PRESS_RELEASE: PressReleaseParams;
}

// ---------------------------------------------------------------------------
// Dosya girdisi
// ---------------------------------------------------------------------------

/**
 * File to upload:
 * - `string`: path on disk (streamed with `fs.openAsBlob`, not loaded into memory)
 * - `Blob` / `File`
 * - `{ data, fileName, contentType? }`: in-memory content
 */
export type FileInput =
  | string
  | Blob
  | { data: Blob | ArrayBuffer | Uint8Array; fileName: string; contentType?: string };

// ---------------------------------------------------------------------------
// Generation istekleri
// ---------------------------------------------------------------------------

type InputVariant =
  | { inputText: string; inputUrl?: never; file?: never }
  | { inputUrl: string; inputText?: never; file?: never }
  | { file: FileInput; inputText?: never; inputUrl?: never };

type NoInput = { inputText?: never; inputUrl?: never; file?: never };

type EventModeRequest<F extends 'NEWS' | 'PRESS_RELEASE'> = {
  featureType: F;
  featureParams: Extract<FeatureParamsMap[F], { mode: 'event' }>;
} & NoInput;

type DescriptionModeRequest<F extends GenerationFeatureType> = {
  featureType: F;
  featureParams?: Exclude<FeatureParamsMap[F], { mode: 'event' }>;
} & InputVariant;

/**
 * Body of `POST /v1/generations`. In the default mode send exactly one input
 * (`inputText`, `inputUrl` or `file`). The event mode of NEWS and PRESS_RELEASE
 * takes no input; the event details go in `featureParams.event`.
 */
export type GenerationCreateParams =
  | DescriptionModeRequest<'TRANSCRIPTION'>
  | DescriptionModeRequest<'DIARIZATION'>
  | DescriptionModeRequest<'PROOFREADING'>
  | DescriptionModeRequest<'NEWS'>
  | DescriptionModeRequest<'PRESS_RELEASE'>
  | EventModeRequest<'NEWS'>
  | EventModeRequest<'PRESS_RELEASE'>;

export interface GenerationListParams {
  skip?: number;
  /** 1–100, defaults to 20. */
  take?: number;
  featureType?: FeatureType;
  status?: GenerationStatus;
  /** Only generations created by this API key; without it, every API generation of your account is returned. */
  apiKeyId?: string;
}

// ---------------------------------------------------------------------------
// Generation responses
// ---------------------------------------------------------------------------

export interface GenerationProgress {
  step: string | null;
  percent: number | null;
}

export interface Generation {
  id: string;
  featureType: FeatureType;
  inputType: InputType;
  status: GenerationStatus;
  title: string | null;
  progress: GenerationProgress;
  /** Amount reserved at start, as a USD string with 6 decimals (e.g. `"0.200000"`). */
  estimatedCostUsd: string;
  /** Final settled amount; set only when `COMPLETED`. */
  actualCostUsd: string | null;
  /**
   * Present only when `COMPLETED`: a Quill Delta document (`{ ops }`). Line
   * attributes depend on the feature — see `TranscriptLineAttributes` and
   * `SpeakerTurnAttributes`. Use `getResultText()` for plain text. Fields may be
   * added over time; validate the ones you rely on.
   */
  result?: GenerationResult;
  /** `COMPLETED` only: anchors linking news quotes to the source audio timeline. */
  quoteAnchors?: unknown;
  audioTimelineOffsetSeconds?: number | null;
  originalText?: string | null;
  /** `ERROR` / `CANCELLED` only: user-presentable error message. */
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Generation result (Quill Delta)
// ---------------------------------------------------------------------------

/** Word-level timing. `s`/`e` are seconds from the start of the source audio. */
export interface TimedWord {
  /** The word as written in the transcript. */
  t: string;
  s: number;
  e: number;
}

/**
 * TRANSCRIPTION line attributes. Present only on lines that could be aligned to
 * the audio; never present when the transcript was translated (`translate_lang`).
 */
export interface TranscriptLineAttributes {
  /** Line start, `MM:SS` or `HH:MM:SS`. */
  start?: string;
  /** Line end, `MM:SS` or `HH:MM:SS`. */
  end?: string;
  words?: TimedWord[];
}

/** DIARIZATION (interview editor) attributes: one op per speaker turn. */
export interface SpeakerTurnAttributes {
  /** Speaker label, e.g. `A`, `B`. */
  speaker: string;
  /** Turn start, `MM:SS` or `HH:MM:SS`. */
  start: string;
  /** Turn end, `MM:SS` or `HH:MM:SS`. */
  end: string;
  /** Display colour suggested for the speaker label. */
  color: string;
  /** Present when word timings are available. */
  words?: TimedWord[];
}

export interface DeltaOp {
  insert?: string | Record<string, unknown>;
  retain?: number;
  delete?: number;
  attributes?: Record<string, unknown>;
}

export interface GenerationResult {
  ops: DeltaOp[];
  /** PROOFREADING only: changes from the input to the corrected text, as delta ops. */
  diff?: { ops: DeltaOp[] };
  [key: string]: unknown;
}

export interface GenerationList {
  items: Generation[];
  total: number;
}

// ---------------------------------------------------------------------------
// Live transcription
// ---------------------------------------------------------------------------

export type LiveTranscriptionState = (typeof LIVE_TRANSCRIPTION_STATES)[number];

export interface LiveTranscriptionCreateParams {
  /** Live stream URL (YouTube, X, ...). */
  url: string;
  title?: string;
  /** Expected language, defaults to `tr`. */
  expectedLanguage?: string;
  speakerLabels?: boolean;
  /** 1–10; only together with `speakerLabels: true`. */
  maxSpeakers?: number;
  includeWords?: boolean;
  /** One of the durations from `liveTranscriptions.options()`; defaults to 120. */
  maxDurationMinutes?: number;
}

export interface LiveTranscriptionTurn {
  turnId: string;
  sequence: number;
  text: string;
  isFinal: boolean;
  startMs: number | null;
  endMs: number | null;
  speaker: string | null;
  language: string | null;
  /** Set only when the session was started with `includeWords: true`. */
  words: LiveTranscriptionWord[] | null;
}

export interface LiveTranscriptionWord {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  speaker: string | null;
}

export type LiveTranscriptionPlatform = (typeof LIVE_TRANSCRIPTION_PLATFORMS)[number];

export interface LiveTranscription {
  id: string;
  url: string | null;
  generationId: string;
  state: LiveTranscriptionState;
  platform: LiveTranscriptionPlatform;
  expectedLanguage: string;
  maxDurationMinutes: number;
  expiresAt: string | null;
  lastSequence: number;
  mediaTitle: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  turns: LiveTranscriptionTurn[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  reservedCostUsd: string;
}

export interface ActiveLiveTranscription {
  id: string;
  url: string | null;
  generationId: string;
  title: string | null;
  state: LiveTranscriptionState;
  platform: LiveTranscriptionPlatform;
  maxDurationMinutes: number;
  expiresAt: string | null;
  startedAt: string | null;
  createdAt: string;
  reservedCostUsd: string;
}

export interface LiveTranscriptionOptions {
  durationOptions: { minutes: number; reservedCostUsd: string }[];
}

export interface LiveTranscriptionExtendOptions {
  currentDurationMinutes: number;
  currentReservedCostUsd: string;
  options: {
    totalDurationMinutes: number;
    additionalReservedCostUsd: string;
    totalReservedCostUsd: string;
  }[];
}

export interface LiveTranscriptionExtendParams {
  /** New total duration in minutes; pick one from `extendOptions()`. */
  totalDurationMinutes: number;
}

// ---------------------------------------------------------------------------
// Common request options
// ---------------------------------------------------------------------------

export interface RequestOptions {
  /** Timeout for this request (ms). Overrides the client default. */
  timeoutMs?: number;
  /** Maximum number of retries for this request. */
  maxRetries?: number;
  signal?: AbortSignal;
  /** Extra HTTP headers. */
  headers?: Record<string, string>;
}

export interface IdempotentRequestOptions extends RequestOptions {
  /**
   * Defaults to a fresh UUID that is reused on automatic retries. If your own job
   * queue may resend the same logical operation, pass a stable key (e.g. derived
   * from your record ID) so it is never charged twice.
   */
  idempotencyKey?: string;
}
