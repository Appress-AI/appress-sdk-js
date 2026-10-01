// Public API v1 sözleşmesinin TypeScript karşılığı.
// Kaynak: appress-nestjs `src/api-platform/` (controller, DTO ve serializer'lar)
// ve `GET /api-reference/openapi.json`. Yanıt şekilleri değişirse önce backend
// sözleşmesi güncellenir, sonra bu dosya (`npm run check:contract` farkı gösterir).

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

/** `/v1/generations` üzerinden başlatılabilen feature'lar (canlı yayın hariç). */
export type GenerationFeatureType = Exclude<FeatureType, 'LIVE_TRANSCRIPTION'>;

export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export type InputType = (typeof INPUT_TYPES)[number];

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export type Tone = (typeof TONES)[number];

// ---------------------------------------------------------------------------
// featureParams
// ---------------------------------------------------------------------------

export interface TranscriptionParams {
  /** Kaynak ses dili. Varsayılan `tr`. */
  stt_lang?: string;
  /** Verilirse deşifre bu dile çevrilir. */
  translate_lang?: string;
  title?: string;
}

export interface DiarizationParams {
  /** Beklenen konuşmacı sayısı (en az 1). */
  speakers_expected?: number;
  title?: string;
}

export interface ProofreadingParams {
  /** `tr` (varsayılan) veya otomatik dil algılama için `intl`. */
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
  /** Çıktı dili, örn. `tr`. */
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
 * Yüklenecek dosya:
 * - `string`: diskteki dosya yolu (bellek dostu, `fs.openAsBlob` ile akıtılır)
 * - `Blob` / `File`
 * - `{ data, fileName, contentType? }`: bellekteki içerik
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
 * `POST /v1/generations` gövdesi. Normal modda tam olarak bir girdi
 * (`inputText`, `inputUrl` veya `file`) gönderilir; NEWS ve PRESS_RELEASE'in
 * event modunda girdi yoktur, olay bilgisi `featureParams.event` içindedir.
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
  /** 1–100, varsayılan 20. */
  take?: number;
  featureType?: FeatureType;
  status?: GenerationStatus;
  /** Yalnız bu anahtarın ürettiklerini getirir; verilmezse tenant'ın tüm API üretimleri döner. */
  apiKeyId?: string;
}

// ---------------------------------------------------------------------------
// Generation yanıtları
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
  /** Başlangıçta rezerve edilen tutar, 6 ondalıklı USD string'i (örn. `"0.200000"`). */
  estimatedCostUsd: string;
  /** Yalnız `COMPLETED` durumunda dolu; mahsup edilen gerçek tutar. */
  actualCostUsd: string | null;
  /**
   * Yalnız `COMPLETED` durumunda bulunur. Şema feature'a göre değişir ve AI
   * çıktısıyla birlikte evrilebilir; kalıcı entegrasyonlarda kendi tarafında doğrula.
   */
  result?: unknown;
  /** Yalnız `COMPLETED`: haber alıntılarını kaynak sesin zaman eksenine bağlayan çapalar. */
  quoteAnchors?: unknown;
  audioTimelineOffsetSeconds?: number | null;
  originalText?: string | null;
  /** Yalnız `ERROR` / `CANCELLED`: kullanıcıya gösterilebilir hata mesajı. */
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationList {
  items: Generation[];
  total: number;
}

// ---------------------------------------------------------------------------
// Canlı transkripsiyon
// ---------------------------------------------------------------------------

export type LiveTranscriptionState = (typeof LIVE_TRANSCRIPTION_STATES)[number];

export interface LiveTranscriptionCreateParams {
  /** Canlı yayın URL'si (YouTube, X...). */
  url: string;
  title?: string;
  /** Beklenen dil, varsayılan `tr`. */
  expectedLanguage?: string;
  speakerLabels?: boolean;
  /** 1–10; yalnız `speakerLabels: true` ile. */
  maxSpeakers?: number;
  includeWords?: boolean;
  /** `liveTranscriptions.options()` içindeki sürelerden biri; varsayılan 120. */
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
  /** Yalnız oturum `includeWords: true` ile başlatıldıysa dolu. */
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
  /** Yeni toplam süre (dakika); `extendOptions()` içinden seçilmeli. */
  totalDurationMinutes: number;
}

// ---------------------------------------------------------------------------
// Ortak istek seçenekleri
// ---------------------------------------------------------------------------

export interface RequestOptions {
  /** Bu istek için zaman aşımı (ms). İstemci varsayılanını ezer. */
  timeoutMs?: number;
  /** Bu istek için en fazla yeniden deneme sayısı. */
  maxRetries?: number;
  signal?: AbortSignal;
  /** Ek HTTP başlıkları. */
  headers?: Record<string, string>;
}

export interface IdempotentRequestOptions extends RequestOptions {
  /**
   * Verilmezse SDK yeni bir UUID üretir ve yeniden denemelerde aynısını kullanır.
   * Kendi kuyruğunda aynı işlemi tekrar gönderebiliyorsan kalıcı bir anahtar ver
   * (örn. kendi kayıt kimliğinden türet); böylece çift ücretlendirme olmaz.
   */
  idempotencyKey?: string;
}
