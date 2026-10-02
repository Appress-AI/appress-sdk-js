# appress-sdk-js — contributor notes

## Rules

- Public repository (MIT). No commit, push or npm publish without explicit maintainer instruction. A published version number can never be reused.
- English only: commits (Conventional Commits), branches, PRs, release notes, comments, JSDoc, error messages, tests, docs.
- This repo documents the public API only. Describe what an endpoint accepts and returns, never how the service produces it.
- The SDK follows the published API contract; it never defines it.

## Release

Bump `package.json`, `src/version.ts` and CHANGELOG, push, then publish a GitHub Release tagged `v<version>`. `.github/workflows/publish.yml` publishes to npm with Trusted Publishing (OIDC, provenance). `ci.yml` runs tests on Node 20/22/24 and `check:contract`.

## Code

- `src/core/http.ts`: request engine (`{success,data}` unwrap, error mapping, retries on 408/429/502/503/504 and network errors with `Retry-After`, per-request timeout/abort).
- `src/resources/`: `generations`, `liveTranscriptions`. `src/types.ts`, `src/constants.ts` (enum values; types derive from them), `src/errors.ts` (class per status + `code`).
- Billable POSTs (`generations.create`, `liveTranscriptions.create`, `extend`) always send `Idempotency-Key`, reused on every retry of one logical call. Do not regress this.
- Refuses to run in a browser unless `dangerouslyAllowBrowser` (the API key would leak).

## Contract

- OpenAPI: `GET https://api.appress.ai/api-reference/openapi.json`
- Limits, enums, feature params, error codes: `GET https://api.appress.ai/api-reference/config`

## Commands

| Purpose | Command |
| --- | --- |
| Typecheck (incl. `@ts-expect-error` type tests) | `npm run typecheck` |
| Tests (mock fetch, no network) | `npm test` |
| Build `dist/` | `npm run build` |
| Contract drift vs the published OpenAPI | `npm run check:contract` (or `-- <url-or-file>`) |
| Package contents | `npm pack --dry-run` |

- Tests never call the real API. `examples/` spend real API credit.
- On contract drift, update `types.ts`/`constants.ts`/resources, the lists in `scripts/check-contract.mjs`, README and CHANGELOG together and bump the version per semver.
- Don't commit `dist/` or `node_modules/`.
