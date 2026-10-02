import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WaitTimeoutError, type GenerationCreateParams } from '../src/index.js';
import { client, generation, liveSession, mockFetch, ok } from './helpers.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('generations.create', () => {
  it('sends the JSON body as is', async () => {
    const { fetch, requests } = mockFetch(ok(generation(), 202));
    await client(fetch).generations.create({
      featureType: 'NEWS',
      inputText: 'text',
      featureParams: { mode: 'description', news_lang: 'tr', news_category: 'technology' },
    });
    const req = requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(req.body as string)).toEqual({
      featureType: 'NEWS',
      inputText: 'text',
      featureParams: { mode: 'description', news_lang: 'tr', news_category: 'technology' },
    });
  });

  it('uploads a file path as multipart with featureParams as a JSON string', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'appress-sdk-'));
    const path = join(dir, 'recording.mp3');
    await writeFile(path, Buffer.from('audio bytes'));
    const { fetch, requests } = mockFetch(ok(generation({ featureType: 'TRANSCRIPTION', inputType: 'FILE' }), 202));

    await client(fetch).generations.create({ featureType: 'TRANSCRIPTION', file: path, featureParams: { stt_lang: 'tr' } });

    const form = requests[0]!.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('featureType')).toBe('TRANSCRIPTION');
    expect(form.get('featureParams')).toBe('{"stt_lang":"tr"}');
    const file = form.get('file') as File;
    expect(file.name).toBe('recording.mp3');
    expect(file.type).toBe('audio/mpeg');
    expect(await file.text()).toBe('audio bytes');
    // fetch sets the multipart boundary; the SDK must not set Content-Type itself.
    expect(requests[0]!.headers.get('content-type')).toBeNull();
  });

  it('uploads in-memory data with a file name', async () => {
    const { fetch, requests } = mockFetch(ok(generation(), 202));
    await client(fetch).generations.create({
      featureType: 'PROOFREADING',
      file: { data: new TextEncoder().encode('text'), fileName: 'note.txt' },
    });
    const file = (requests[0]!.body as FormData).get('file') as File;
    expect(file.name).toBe('note.txt');
    expect(file.type).toBe('text/plain');
  });

  it('sends event mode without an input', async () => {
    const { fetch, requests } = mockFetch(ok(generation(), 202));
    await client(fetch).generations.create({
      featureType: 'PRESS_RELEASE',
      featureParams: {
        mode: 'event',
        event: { description: 'Product launch', news_category: 'technology', tone: 'Objective', language: 'tr' },
      },
    });
    expect(JSON.parse(requests[0]!.body as string)).not.toHaveProperty('inputText');
  });
});

describe('generations.waitForCompletion', () => {
  it('polls until a final status and reports progress', async () => {
    const { fetch, requests } = mockFetch(
      ok(generation({ status: 'PENDING' })),
      ok(generation({ status: 'PROCESSING', progress: { step: 'processing', percent: 40 } })),
      ok(generation({ status: 'COMPLETED', result: { text: 'article' }, actualCostUsd: '0.180000' })),
    );
    const seen: string[] = [];
    const result = await client(fetch).generations.waitForCompletion('id', {
      pollIntervalMs: 1,
      onProgress: (g) => seen.push(g.status),
    });
    expect(result.result).toEqual({ text: 'article' });
    expect(seen).toEqual(['PENDING', 'PROCESSING', 'COMPLETED']);
    expect(requests).toHaveLength(3);
  });

  it('returns ERROR without throwing', async () => {
    const { fetch } = mockFetch(ok(generation({ status: 'ERROR', error: 'Audio could not be decoded' })));
    const result = await client(fetch).generations.waitForCompletion('id');
    expect(result).toMatchObject({ status: 'ERROR', error: 'Audio could not be decoded' });
  });

  it('throws WaitTimeoutError when the wait limit is reached', async () => {
    const { fetch } = mockFetch(ok(generation({ status: 'PROCESSING' })));
    await expect(
      client(fetch).generations.waitForCompletion('id', { pollIntervalMs: 1, waitTimeoutMs: 5 }),
    ).rejects.toBeInstanceOf(WaitTimeoutError);
  });

  it('createAndWait creates and waits', async () => {
    const { fetch, requests } = mockFetch(ok(generation(), 202), ok(generation({ status: 'COMPLETED' })));
    const result = await client(fetch).generations.createAndWait(
      { featureType: 'NEWS', inputText: 'x' },
      { pollIntervalMs: 1 },
    );
    expect(result.status).toBe('COMPLETED');
    expect(requests.map((r) => r.method)).toEqual(['POST', 'GET']);
    expect(requests[1]!.headers.get('idempotency-key')).toBeNull();
  });
});

describe('generations.iterate', () => {
  it('walks every page', async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => generation({ id: `g${i}` }));
    const { fetch, requests } = mockFetch(ok({ items: page(2), total: 3 }), ok({ items: page(1), total: 3 }));
    const ids: string[] = [];
    for await (const g of client(fetch).generations.iterate({ take: 2 })) ids.push(g.id);
    expect(ids).toHaveLength(3);
    expect(requests.map((r) => r.url.searchParams.get('skip'))).toEqual(['0', '2']);
  });
});

describe('liveTranscriptions', () => {
  it('create and extend send an Idempotency-Key', async () => {
    const { fetch, requests } = mockFetch(ok(liveSession(), 202), ok(liveSession({ maxDurationMinutes: 150 })));
    const live = client(fetch).liveTranscriptions;
    const session = await live.create({ url: 'https://www.youtube.com/watch?v=x', maxDurationMinutes: 120 });
    await live.extend(session.id, { totalDurationMinutes: 150 });
    expect(requests[0]!.url.pathname).toBe('/v1/live-transcriptions');
    expect(requests[1]!.url.pathname).toBe(`/v1/live-transcriptions/${session.id}/extend`);
    for (const req of requests) expect(req.headers.get('idempotency-key')).toBeTruthy();
  });

  it('stop sends no Idempotency-Key', async () => {
    const { fetch, requests } = mockFetch(ok(liveSession({ state: 'STOPPING' }), 202));
    await client(fetch).liveTranscriptions.stop('id');
    expect(requests[0]!.headers.get('idempotency-key')).toBeNull();
  });

  it('streamTurns yields each final turn once and ends with the session', async () => {
    const turn = (turnId: string, text: string, isFinal: boolean, sequence: number) => ({
      turnId,
      sequence,
      text,
      isFinal,
      startMs: null,
      endMs: null,
      speaker: null,
      language: 'tr',
      words: null,
    });
    const { fetch } = mockFetch(
      ok(liveSession({ turns: [turn('a', 'Hell', false, 1)] })),
      ok(liveSession({ turns: [turn('a', 'Hello', true, 2), turn('b', 'Today', false, 3)] })),
      ok(liveSession({ state: 'COMPLETED', turns: [turn('a', 'Hello', true, 2), turn('b', 'Today the weather', true, 4)] })),
    );
    const texts: string[] = [];
    for await (const t of client(fetch).liveTranscriptions.streamTurns('id', { pollIntervalMs: 1 })) texts.push(t.text);
    expect(texts).toEqual(['Hello', 'Today the weather']);
  });

  it('streamTurns with includePartial also yields interim text', async () => {
    const turn = (text: string, isFinal: boolean) => ({
      turnId: 'a',
      sequence: 1,
      text,
      isFinal,
      startMs: null,
      endMs: null,
      speaker: null,
      language: 'tr',
      words: null,
    });
    const { fetch } = mockFetch(
      ok(liveSession({ turns: [turn('Hel', false)] })),
      ok(liveSession({ turns: [turn('Hel', false)] })),
      ok(liveSession({ state: 'COMPLETED', turns: [turn('Hello', true)] })),
    );
    const texts: string[] = [];
    const stream = client(fetch).liveTranscriptions.streamTurns('id', { pollIntervalMs: 1, includePartial: true });
    for await (const t of stream) texts.push(t.text);
    expect(texts).toEqual(['Hel', 'Hello']);
  });
});

describe('type safety (checked by tsc)', () => {
  it('rejects invalid combinations at compile time', () => {
    const valid: GenerationCreateParams[] = [
      { featureType: 'TRANSCRIPTION', inputUrl: 'https://example.com/a.mp3' },
      { featureType: 'PROOFREADING', inputText: 'x', featureParams: { language: 'intl' } },
    ];
    // @ts-expect-error only one input at a time
    const twoInputs: GenerationCreateParams = { featureType: 'NEWS', inputText: 'x', inputUrl: 'https://x' };
    // @ts-expect-error an input is required outside event mode
    const noInput: GenerationCreateParams = { featureType: 'TRANSCRIPTION' };
    const badCategory: GenerationCreateParams = {
      featureType: 'NEWS',
      inputText: 'x',
      // @ts-expect-error category must be one of the slugs
      featureParams: { news_category: 'sport' },
    };
    // @ts-expect-error live transcription is not started via /v1/generations
    const live: GenerationCreateParams = { featureType: 'LIVE_TRANSCRIPTION', inputUrl: 'https://x' };
    expect([valid, twoInputs, noInput, badCategory, live]).toHaveLength(5);
  });
});
