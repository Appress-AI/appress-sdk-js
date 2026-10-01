# Changelog

## 0.2.0 — 2026-10-01

- `Generation.result` is now typed as a Quill Delta (`GenerationResult`) with documented TRANSCRIPTION / DIARIZATION attributes (`TimedWord`, `TranscriptLineAttributes`, `SpeakerTurnAttributes`).
- New helpers: `getResultText`, `getSpeakerTurns`, `getTimedWords`.

## 0.1.1 — 2026-10-01

- Error messages thrown by the SDK itself (missing API key, browser guard, timeouts, aborts) are now in English.

## 0.1.0 — 2026-10-01

- First version: `generations` (create, retrieve, list, iterate, waitForCompletion, createAndWait)
  and `liveTranscriptions` (options, active, create, retrieve, stop, extendOptions, extend, streamTurns).
- Automatic `Idempotency-Key`, retry/backoff with `Retry-After`, typed errors, file upload from path/Blob/buffer.
