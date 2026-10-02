// Enum values of the API contract. Types are derived from these, and
// `check:contract` compares them with the backend OpenAPI document.

export const FEATURE_TYPES = [
  'TRANSCRIPTION',
  'LIVE_TRANSCRIPTION',
  'PRESS_RELEASE',
  'NEWS',
  'DIARIZATION',
  'PROOFREADING',
] as const;

export const GENERATION_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'ERROR', 'CANCELLED'] as const;

export const INPUT_TYPES = ['TEXT', 'URL', 'FILE'] as const;

export const LIVE_TRANSCRIPTION_STATES = ['CREATED', 'STARTING', 'STREAMING', 'STOPPING', 'COMPLETED', 'FAILED'] as const;

/** `failureCode` values of a `FAILED` live session. New values may be added. */
export const LIVE_TRANSCRIPTION_FAILURE_CODES = [
  'UNSUPPORTED_URL',
  'NOT_LIVE_STREAM',
  'NO_AUDIO_STREAM',
  'SOURCE_UNAVAILABLE',
  'PROCESSING_FAILED',
  'SERVICE_UNAVAILABLE',
  'SERVICE_BUSY',
  'INVALID_INPUT',
  'RESERVATION_EXPIRED',
  'INTERRUPTED',
  'INTERNAL_ERROR',
] as const;

/** `progress.step` values of a generation. New values may be added. */
export const GENERATION_PROGRESS_STEPS = ['preparing', 'processing', 'finalizing'] as const;

export const LIVE_TRANSCRIPTION_PLATFORMS = ['youtube', 'x', 'microphone'] as const;

/** `news_category` values for NEWS and PRESS_RELEASE. */
export const NEWS_CATEGORIES = [
  'politics',
  'economy_finance_energy',
  'sports',
  'technology',
  'health',
  'education',
  'culture_arts',
  'diplomacy',
  'defense',
  'police_justice',
  'terrorism',
  'traffic_accident',
  'mining_accident',
  'natural_disaster',
  'environment_agriculture',
] as const;

export const TONES = ['Objective', 'Critical', 'Investigative', 'Marketing', 'Supportive'] as const;

/** Stable error codes the API can return under `/v1` (the `code` of an `APIError`). */
export const ERROR_CODES = [
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_CONFLICT',
  'IDEMPOTENCY_REQUEST_IN_PROGRESS',
  'CONCURRENT_GENERATION_LIMIT',
  'LIVE_SESSION_NOT_EXTENDABLE',
  'LIVE_EXTENSION_IN_PROGRESS',
  'LIVE_EXTENSION_INVALID',
  'INSUFFICIENT_API_CREDIT',
  'INVALID_API_KEY',
  'RATE_LIMIT_EXCEEDED',
  'RATE_LIMIT_UNAVAILABLE',
  'SERVICE_BUSY',
] as const;
