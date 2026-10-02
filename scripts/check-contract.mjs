// Compares the SDK's contract assumptions with the backend's public OpenAPI document.
//
//   npm run check:contract                         # live https://api.appress.ai document
//   npm run check:contract -- ./path/to/openapi.json  # a local or unreleased document
//
// Lists added/removed endpoints, enum values or response fields and exits with 1.
// A difference means `src/types.ts` / `src/constants.ts` and the resources need an
// update; update the lists in this file together with them.
import { readFile } from 'node:fs/promises';
import * as sdk from '../dist/index.js';

const source = process.argv[2] ?? 'https://api.appress.ai/api-reference/openapi.json';

/** Endpoints wrapped by the SDK (method + OpenAPI path). */
const ENDPOINTS = [
  'POST /v1/generations',
  'GET /v1/generations',
  'GET /v1/generations/{id}',
  'GET /v1/live-transcriptions/options',
  'GET /v1/live-transcriptions/active',
  'POST /v1/live-transcriptions',
  'GET /v1/live-transcriptions/{id}',
  'GET /v1/live-transcriptions/{id}/extend-options',
  'POST /v1/live-transcriptions/{id}/stop',
  'POST /v1/live-transcriptions/{id}/extend',
];

/** OpenAPI enum schema → SDK constant. */
const ENUMS = {
  FeatureType: sdk.FEATURE_TYPES,
  GenerationStatus: sdk.GENERATION_STATUSES,
  ApiGenerationInputType: sdk.INPUT_TYPES,
  LiveTranscriptionState: sdk.LIVE_TRANSCRIPTION_STATES,
  LiveTranscriptionPlatform: sdk.LIVE_TRANSCRIPTION_PLATFORMS,
  LiveTranscriptionFailureCode: sdk.LIVE_TRANSCRIPTION_FAILURE_CODES,
  GenerationProgressStep: sdk.GENERATION_PROGRESS_STEPS,
};

/** OpenAPI object schema → fields of the matching `src/types.ts` interface. */
const OBJECTS = {
  ApiGenerationDto: [
    'id', 'featureType', 'inputType', 'status', 'title', 'progress', 'estimatedCostUsd', 'actualCostUsd',
    'result', 'quoteAnchors', 'audioTimelineOffsetSeconds', 'originalText', 'error', 'createdAt', 'updatedAt',
  ],
  ApiGenerationProgressDto: ['step', 'percent'],
  ApiGenerationListDto: ['items', 'total'],
  ApiLiveSessionDto: [
    'id', 'url', 'generationId', 'state', 'platform', 'expectedLanguage', 'maxDurationMinutes', 'expiresAt',
    'lastSequence', 'mediaTitle', 'failureCode', 'failureMessage', 'turns', 'createdAt', 'startedAt',
    'completedAt', 'reservedCostUsd',
  ],
  ApiLiveTurnDto: ['turnId', 'sequence', 'text', 'isFinal', 'startMs', 'endMs', 'speaker', 'language', 'words'],
  ApiLiveWordDto: ['text', 'startMs', 'endMs', 'confidence', 'speaker'],
  ApiActiveLiveSessionDto: [
    'id', 'url', 'generationId', 'title', 'state', 'platform', 'maxDurationMinutes', 'expiresAt', 'startedAt',
    'createdAt', 'reservedCostUsd',
  ],
  ApiLiveOptionsDto: ['durationOptions'],
  ApiLiveDurationOptionDto: ['minutes', 'reservedCostUsd'],
  ApiLiveExtendOptionsDto: ['currentDurationMinutes', 'currentReservedCostUsd', 'options'],
  ApiLiveExtendOptionDto: ['totalDurationMinutes', 'additionalReservedCostUsd', 'totalReservedCostUsd'],
  CreateApiGenerationDto: ['featureType', 'inputText', 'inputUrl', 'featureParams'],
  CreateLiveTranscriptionDto: [
    // `source` is intentionally absent from the SDK: the API only accepts "url", the default.
    'source', 'url', 'title', 'expectedLanguage', 'speakerLabels', 'maxSpeakers', 'includeWords', 'maxDurationMinutes',
  ],
  ExtendApiLiveTranscriptionDto: ['totalDurationMinutes'],
};

const IDEMPOTENT = ['POST /v1/generations', 'POST /v1/live-transcriptions', 'POST /v1/live-transcriptions/{id}/extend'];

const spec = JSON.parse(
  /^https?:/.test(source) ? await (await fetch(source)).text() : await readFile(source, 'utf8'),
);
const problems = [];
const diff = (label, expected, actual) => {
  const missing = actual.filter((v) => !expected.includes(v));
  const extra = expected.filter((v) => !actual.includes(v));
  if (missing.length) problems.push(`${label}: in backend, missing in SDK → ${missing.join(', ')}`);
  if (extra.length) problems.push(`${label}: in SDK, missing in backend → ${extra.join(', ')}`);
};

const operations = Object.entries(spec.paths ?? {}).flatMap(([path, ops]) =>
  Object.keys(ops).map((method) => [`${method.toUpperCase()} ${path}`, ops[method]]),
);
diff('Endpoints', ENDPOINTS, operations.map(([key]) => key));

for (const [key, op] of operations) {
  const hasKey = (op.parameters ?? []).some((p) => p.in === 'header' && p.name.toLowerCase() === 'idempotency-key');
  if (hasKey !== IDEMPOTENT.includes(key)) {
    problems.push(`${key}: Idempotency-Key ${hasKey ? 'required by backend, not sent by SDK' : 'sent by SDK, not declared by backend'}`);
  }
}

const schemas = spec.components?.schemas ?? {};
for (const [name, values] of Object.entries(ENUMS)) {
  if (!schemas[name]?.enum) problems.push(`Missing enum schema: ${name}`);
  else diff(`Enum ${name}`, [...values], schemas[name].enum);
}
for (const [name, fields] of Object.entries(OBJECTS)) {
  if (!schemas[name]?.properties) problems.push(`Missing object schema: ${name}`);
  else diff(`Fields ${name}`, fields, Object.keys(schemas[name].properties));
}

// Values published only in `GET /api-reference/config` (not in the OpenAPI document).
const configUrl = /^https?:/.test(source) ? new URL('/api-reference/config', source).toString() : process.env.APPRESS_CONFIG_URL;
if (configUrl) {
  const config = (await (await fetch(configUrl)).json()).data;
  diff('News categories', [...sdk.NEWS_CATEGORIES], config?.generations?.newsCategories ?? []);
  diff('Live failure codes', [...sdk.LIVE_TRANSCRIPTION_FAILURE_CODES], config?.liveTranscription?.failureCodes ?? []);
  diff('Error codes', [...sdk.ERROR_CODES], (config?.errors?.codes ?? []).map((c) => c.code));
}

if (problems.length) {
  console.error(`Contract drift (${source}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`SDK contract is up to date (${operations.length} endpoints, ${Object.keys(ENUMS).length} enums, ${Object.keys(OBJECTS).length} schemas).`);
