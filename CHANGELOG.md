# Changelog

## Unreleased

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
