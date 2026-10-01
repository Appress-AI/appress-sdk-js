# @appress/sdk

Official Node.js / TypeScript client for the [Appress](https://appress.ai) public API.

- Automatic `Idempotency-Key` on every billable request, preserved across retries — no double charges.
- Retries with exponential backoff on `429`, `503`, timeouts and network failures (honours `Retry-After`).
- `waitForCompletion()` polling helper and `streamTurns()` for live transcription.
- File upload from a path, `Blob` or buffer — large files are streamed from disk, not loaded into memory.
- Typed `featureParams` per feature and typed errors (`InsufficientCreditError`, `RateLimitError`, …).
- Zero runtime dependencies. Node.js 20.3+. ESM and CommonJS.

> **Server-side only.** Your API key grants access to your wallet. Never ship it to a browser;
> the SDK refuses to run in one unless you pass `dangerouslyAllowBrowser: true`.

## Install

```bash
npm install @appress/sdk
```

## Quick start

```ts
import { Appress } from '@appress/sdk';

const appress = new Appress(); // reads APPRESS_API_KEY

const news = await appress.generations.createAndWait({
  featureType: 'NEWS',
  inputText: 'Appress announced a new version of its AI-powered content platform.',
  featureParams: { news_lang: 'en', tone: 'Objective', news_category: 'teknoloji' },
});

if (news.status === 'COMPLETED') console.log(news.result);
else console.error(news.status, news.error);
```

Generations are asynchronous. `create()` returns immediately with `status: "PENDING"`;
`waitForCompletion()` polls (2 s, backing off to 10 s) until `COMPLETED`, `ERROR` or `CANCELLED`.
`ERROR`/`CANCELLED` are returned, not thrown — check `status`.

## Configuration

```ts
const appress = new Appress({
  apiKey: process.env.APPRESS_API_KEY, // default: APPRESS_API_KEY
  baseURL: 'https://api.appress.ai',   // default: APPRESS_BASE_URL or https://api.appress.ai
  timeoutMs: 60_000,                   // per request; file uploads default to 30 min
  maxRetries: 4,                       // 408/429/502/503/504 and network errors
});
```

Every method also accepts per-call `{ timeoutMs, maxRetries, signal, headers }`.

## Generations

| Feature | `featureType` | Inputs |
| --- | --- | --- |
| Transcription | `TRANSCRIPTION` | file, URL |
| Interview editor (diarization) | `DIARIZATION` | file, URL |
| Proofreading | `PROOFREADING` | file, text |
| News | `NEWS` | file, URL, text, or event mode |
| Press release | `PRESS_RELEASE` | file, URL, text, or event mode |

Send exactly one of `inputText`, `inputUrl` or `file` — TypeScript enforces it.
Live, current limits and parameter lists are published at
[`GET /api-reference/config`](https://api.appress.ai/api-reference/config).

### File upload

```ts
// From a path: streamed from disk.
const job = await appress.generations.create({
  featureType: 'TRANSCRIPTION',
  file: './interview.mp3',
  featureParams: { stt_lang: 'tr' },
});

// From memory.
await appress.generations.create({
  featureType: 'PROOFREADING',
  file: { data: buffer, fileName: 'draft.docx' },
});
```

### Event mode (no input)

```ts
await appress.generations.create({
  featureType: 'PRESS_RELEASE',
  featureParams: {
    mode: 'event',
    event: { description: 'Product launch in Istanbul', news_category: 'teknoloji', tone: 'Objective', language: 'en' },
  },
});
```

### Poll, list, iterate

```ts
const job = await appress.generations.create({ featureType: 'NEWS', inputUrl: 'https://…' });

const done = await appress.generations.waitForCompletion(job.id, {
  waitTimeoutMs: 20 * 60_000,
  onProgress: (g) => console.log(g.status, g.progress.percent),
});

const page = await appress.generations.list({ status: 'COMPLETED', take: 50 });

for await (const g of appress.generations.iterate({ featureType: 'TRANSCRIPTION' })) {
  console.log(g.id, g.actualCostUsd);
}
```

`result` is feature-specific JSON that evolves with the AI output; validate the fields you rely on.

## Live transcription

```ts
const { durationOptions } = await appress.liveTranscriptions.options();

const session = await appress.liveTranscriptions.create({
  url: 'https://www.youtube.com/watch?v=…',
  maxDurationMinutes: 60,
  speakerLabels: true,
});

for await (const turn of appress.liveTranscriptions.streamTurns(session.id)) {
  console.log(`[${turn.speaker ?? '-'}] ${turn.text}`);
}
```

`streamTurns` yields each finalised turn once and ends when the session is `COMPLETED` or `FAILED`.
Pass `{ includePartial: true }` for interim text. Breaking out of the loop does **not** stop the
session — call `stop(id)`. Use `extendOptions(id)` / `extend(id, { totalDurationMinutes })` to extend.

## Idempotency

`create()` and `extend()` send a fresh UUID `Idempotency-Key`, reused on automatic retries.
If your own job queue may re-run the same logical request, pass a stable key derived from your record:

```ts
await appress.generations.create(params, { idempotencyKey: `article-${article.id}` });
```

Same key + same body returns the original generation; same key + different body throws `IdempotencyConflictError`.

## Errors

```ts
import { InsufficientCreditError, RateLimitError, APIError } from '@appress/sdk';

try {
  await appress.generations.create(params);
} catch (err) {
  if (err instanceof InsufficientCreditError) { /* top up — nothing was charged */ }
  else if (err instanceof RateLimitError) { /* retries exhausted; err.retryAfterSeconds */ }
  else if (err instanceof APIError) console.error(err.status, err.code, err.message);
  else throw err;
}
```

| Class | HTTP | Retried |
| --- | --- | --- |
| `BadRequestError` | 400 | no |
| `AuthenticationError` | 401 | no |
| `PermissionDeniedError` / `InsufficientCreditError` | 403 | no |
| `NotFoundError` | 404 | no |
| `ConflictError` / `IdempotencyConflictError` / `ConcurrencyLimitError` | 409 | no |
| `PayloadTooLargeError` | 413 | no |
| `RateLimitError` | 429 | yes |
| `InternalServerError` | 5xx | 502/503/504 only |
| `APIConnectionError` / `APITimeoutError` | — | yes |

`err.code` carries a stable machine-readable code (e.g. `CONCURRENT_GENERATION_LIMIT`); `err.message`
is human-readable (Turkish) and may change.

## Escape hatch

```ts
const config = await appress.request({ method: 'GET', path: '/api-reference/config' });
```

## License

MIT
