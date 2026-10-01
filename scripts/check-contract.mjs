// SDK'nın sözleşme varsayımlarını backend'in public OpenAPI belgesiyle karşılaştırır.
//
//   npm run check:contract                                   # ../appress-nestjs/openapi/public-v1.json
//   npm run check:contract -- https://api.appress.ai/api-reference/openapi.json
//
// Uç noktası, enum değeri veya yanıt alanı eklendi/kaldırıldıysa farkı listeler ve
// 1 ile çıkar. Fark, SDK'nın `src/types.ts` / `src/constants.ts` ve kaynaklarının
// güncellenmesi gerektiği anlamına gelir; bu dosyadaki listeler de onlarla birlikte güncellenir.
import { readFile } from 'node:fs/promises';
import * as sdk from '../dist/index.js';

const source = process.argv[2] ?? new URL('../../appress-nestjs/openapi/public-v1.json', import.meta.url).pathname;

/** SDK'nın sarmaladığı uçlar (method + OpenAPI yolu). */
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

/** OpenAPI enum şeması → SDK sabiti. */
const ENUMS = {
  FeatureType: sdk.FEATURE_TYPES,
  GenerationStatus: sdk.GENERATION_STATUSES,
  ApiGenerationInputType: sdk.INPUT_TYPES,
  LiveTranscriptionState: sdk.LIVE_TRANSCRIPTION_STATES,
  LiveTranscriptionPlatform: sdk.LIVE_TRANSCRIPTION_PLATFORMS,
};

/** OpenAPI nesne şeması → `src/types.ts` arayüzündeki alanlar. */
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
    // `source` SDK'da bilinçli yok: API yalnız "url" kabul eder ve varsayılan odur.
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
  if (missing.length) problems.push(`${label}: backend'de var, SDK'da yok → ${missing.join(', ')}`);
  if (extra.length) problems.push(`${label}: SDK'da var, backend'de yok → ${extra.join(', ')}`);
};

const operations = Object.entries(spec.paths ?? {}).flatMap(([path, ops]) =>
  Object.keys(ops).map((method) => [`${method.toUpperCase()} ${path}`, ops[method]]),
);
diff('Uç noktalar', ENDPOINTS, operations.map(([key]) => key));

for (const [key, op] of operations) {
  const hasKey = (op.parameters ?? []).some((p) => p.in === 'header' && p.name.toLowerCase() === 'idempotency-key');
  if (hasKey !== IDEMPOTENT.includes(key)) {
    problems.push(`${key}: Idempotency-Key ${hasKey ? 'backend’de zorunlu, SDK göndermiyor' : 'SDK gönderiyor, backend tanımlamıyor'}`);
  }
}

const schemas = spec.components?.schemas ?? {};
for (const [name, values] of Object.entries(ENUMS)) {
  if (!schemas[name]?.enum) problems.push(`Enum şeması yok: ${name}`);
  else diff(`Enum ${name}`, [...values], schemas[name].enum);
}
for (const [name, fields] of Object.entries(OBJECTS)) {
  if (!schemas[name]?.properties) problems.push(`Nesne şeması yok: ${name}`);
  else diff(`Alanlar ${name}`, fields, Object.keys(schemas[name].properties));
}

if (problems.length) {
  console.error(`Sözleşme farkı (${source}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`SDK sözleşmesi güncel (${operations.length} uç, ${Object.keys(ENUMS).length} enum, ${Object.keys(OBJECTS).length} şema).`);
