# appress-sdk-js — public API SDK

## Workspace policy and ownership

- When working inside the Appress workspace, also follow the workspace-level instructions (they live outside this public repo).
- Independent Git repository: `Appress-AI/appress-sdk-js` (public, MIT). No commit, push or **npm publish** without explicit user instruction. Publishing is irreversible for a version number.
- Release: bump `package.json` + `src/version.ts` + CHANGELOG, push, then a GitHub Release tagged `v<version>` runs `.github/workflows/publish.yml` (npm Trusted Publishing/OIDC, no token or 2FA code; provenance automatic). CI (`ci.yml`) runs tests on Node 20/22/24 and `check:contract` against the live `api.appress.ai` OpenAPI.
- The SDK consumes the backend contract; it never defines it. New fields/codes/endpoints land in the (private) backend first.

## Language: English only (public repository)

- This repository and the npm package are public. Write everything in English: commit messages, branch names, PR titles/descriptions, release notes, tags, code comments, JSDoc, error messages thrown by the SDK, test names, script output, README, CHANGELOG and this file.
- Commits use English Conventional Commits (`feat:`, `fix:`, `docs:`, `ci:`, `chore:` …). This overrides the workspace's Turkish commit convention for this repo only.
- Exceptions: verbatim backend `message` text in fixtures. Contract values are English (`news_category` uses English slugs such as `technology`; the API still accepts legacy Turkish slugs, which the SDK does not advertise).
- Conversation with the user may still be Turkish; only repository content is English.

## What it is

- `@appress/sdk`: zero-dependency TypeScript client for the public `/v1` API (API-key Bearer auth). Node ≥ 20.3, ESM + CJS via tsup.
- `src/core/http.ts`: request engine — `{success,data}` unwrap, error mapping, retry (408/429/502/503/504 + network, honours `Retry-After`), per-request timeout/abort.
- `src/resources/`: `generations` (create/retrieve/list/iterate/waitForCompletion/createAndWait), `liveTranscriptions` (options/active/create/retrieve/stop/extendOptions/extend/streamTurns).
- `src/types.ts` (request/response types, typed `featureParams`), `src/constants.ts` (enum values; types derive from them), `src/errors.ts` (class per status + `code`).
- Billable POSTs (`generations.create`, `liveTranscriptions.create`, `extend`) always send `Idempotency-Key`; the same key is reused on every retry of one logical call. Do not regress this.
- Refuses to run in a browser unless `dangerouslyAllowBrowser` (API key would leak).

## Contract sources (public endpoints)

- OpenAPI document of `/v1`: `GET https://api.appress.ai/api-reference/openapi.json`.
- Limits, enums, feature params and error codes: `GET https://api.appress.ai/api-reference/config` (`errors.codes`).
- Never put private backend paths, internal service names or infrastructure details in this repo.

## Commands

| Purpose | Command |
| --- | --- |
| Typecheck (incl. `@ts-expect-error` type tests) | `npm run typecheck` |
| Tests (mock fetch, no network) | `npm test` |
| Build `dist/` | `npm run build` |
| Contract drift vs backend OpenAPI | `npm run check:contract` (live API; or `-- <url-or-file>` for a local document) |
| Package contents | `npm pack --dry-run` |

- Tests never call the real API. `examples/` spend real API credit — run only on explicit request.
- When `check:contract` reports drift: update `types.ts`/`constants.ts`/resources, the lists in `scripts/check-contract.mjs`, README and CHANGELOG together; bump version per semver (breaking type change → major once ≥1.0).
- Don't commit `dist/` or `node_modules/`.
