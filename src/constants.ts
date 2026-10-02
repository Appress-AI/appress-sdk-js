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

export const LIVE_TRANSCRIPTION_STATES = [
  'CREATED',
  'RESOLVING_SOURCE',
  'CONNECTING_STT',
  'STREAMING',
  'STOPPING',
  'COMPLETED',
  'FAILED',
] as const;

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
