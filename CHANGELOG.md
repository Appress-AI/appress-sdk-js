# Changelog

## Unreleased

- Live transcriptions accept `translationLanguages` (set at creation, up to `options().translation.maxLanguages`). Each turn has `translations` keyed by language (`status`: `pending` | `completed` | `failed`, `text` when completed); sessions and active sessions list `translationLanguages`. `options()` returns `translation.languages`, `translation.maxLanguages` and `translationReservedCostUsdPerLanguage` per duration.
- Webhooks: `verifyWebhook(rawBody, headers, secret)` verifies a delivery (`Appress-Webhook-Signature`, timestamp tolerance 300 s by default) and returns the typed `WebhookEvent`; throws `WebhookVerificationError`. New `WEBHOOK_EVENT_TYPES` and `WEBHOOK_TEST_EVENT_TYPE`. Works in Node.js 20+, Deno, Bun and edge runtimes (Web Crypto).
- New error codes: `LIVE_TRANSLATION_INVALID_LANGUAGE`, `LIVE_TRANSLATION_SAME_LANGUAGE`, `LIVE_TRANSLATION_LIMIT_REACHED`.
- Breaking (types only): `LiveTranscriptionPlatform` is `youtube` | `x`; the API never returned `microphone` for API sessions.

- `DiarizationParams` accepts `stt_lang` (source audio language) and `translate_lang` (the interview is translated into this language). Translated interviews keep one op per speaker turn with `speaker`, `start`, `end`, `color`, without `words`; turns with no translatable content are omitted. `translate_lang` takes a language code such as `en`, `ar` or `pt-BR`.
- `expectedLanguage` accepts `"auto"` (detects the spoken language, which may change during the session) or one of the supported language codes listed in the API reference; other values are rejected with a 400 error.

## 0.4.0 — 2026-10-02

- Breaking: live session `state` values are `CREATED`, `STARTING`, `STREAMING`, `STOPPING`, `COMPLETED`, `FAILED`; the intermediate start-up states are reported as `STARTING`.
- Live session `failureCode` is typed with the published `LIVE_TRANSCRIPTION_FAILURE_CODES`; `progress.step` with `GENERATION_PROGRESS_STEPS` (`preparing`, `processing`, `finalizing`). New values may be added to both.
- Breaking: the 503 busy error code is `SERVICE_BUSY`. New `ERROR_CODES` constant; `AppressErrorCode` derives from it.
- `check:contract` also compares live failure codes and error codes with `GET /api-reference/config`.

## 0.3.0 — 2026-10-01

- `news_category` uses English values (`technology`, `sports`, …). `NewsCategory` and `NEWS_CATEGORIES` now list the English values.
- `check:contract` also compares the category list with `GET /api-reference/config`.

## 0.2.0 — 2026-10-01

- `Generation.result` is now typed as a Quill Delta (`GenerationResult`) with documented TRANSCRIPTION / DIARIZATION attributes (`TimedWord`, `TranscriptLineAttributes`, `SpeakerTurnAttributes`).
- New helpers: `getResultText`, `getSpeakerTurns`, `getTimedWords`.

## 0.1.1 — 2026-10-01

- Error messages thrown by the SDK itself (missing API key, browser guard, timeouts, aborts) are now in English.

## 0.1.0 — 2026-10-01

- First version: `generations` (create, retrieve, list, iterate, waitForCompletion, createAndWait)
  and `liveTranscriptions` (options, active, create, retrieve, stop, extendOptions, extend, streamTurns).
- Automatic `Idempotency-Key`, retry/backoff with `Retry-After`, typed errors, file upload from path/Blob/buffer.
