# Changelog

## Unreleased

- Error messages thrown by the SDK itself (missing API key, browser guard, timeouts, aborts) are now in English.

## 0.1.0 — 2026-10-01

- First version: `generations` (create, retrieve, list, iterate, waitForCompletion, createAndWait)
  and `liveTranscriptions` (options, active, create, retrieve, stop, extendOptions, extend, streamTurns).
- Automatic `Idempotency-Key`, retry/backoff with `Retry-After`, typed errors, file upload from path/Blob/buffer.
