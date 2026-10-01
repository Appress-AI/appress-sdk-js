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

export const NEWS_CATEGORIES = [
  'politika',
  'ekonomi_finans_enerji',
  'spor',
  'teknoloji',
  'saglik',
  'egitim',
  'kultur_sanat',
  'diplomasi',
  'savunma',
  'polis_adliye_yargi',
  'teror',
  'trafik_kazasi',
  'maden_kazasi',
  'dogal_afet',
  'cevre_tarim',
] as const;

export const TONES = ['Objective', 'Critical', 'Investigative', 'Marketing', 'Supportive'] as const;
