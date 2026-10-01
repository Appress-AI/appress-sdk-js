// Compares the SDK's contract assumptions with the backend's public OpenAPI document.
//
//   npm run check:contract                                   # ../appress-nestjs/openapi/public-v1.json
//   npm run check:contract -- https://api.appress.ai/api-reference/openapi.json
//
// Lists added/removed endpoints, enum values or response fields and exits with 1.
// A difference means `src/types.ts` / `src/constants.ts` and the resources need an
// update; update the lists in this file together with them.
import { readFile } from 'node:fs/promises';
import * as sdk from '../dist/index.js';

const source = process.argv[2] ?? new URL('../../appress-nestjs/openapi/public-v1.json', import.meta.url).pathname;

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

if (problems.length) {
  console.error(`Contract drift (${source}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`SDK contract is up to date (${operations.length} endpoints, ${Object.keys(ENUMS).length} enums, ${Object.keys(OBJECTS).length} schemas).`);
