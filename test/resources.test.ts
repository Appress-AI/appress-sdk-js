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
  it('JSON gövdeyi olduğu gibi gönderir', async () => {
    const { fetch, requests } = mockFetch(ok(generation(), 202));
    await client(fetch).generations.create({
      featureType: 'NEWS',
      inputText: 'metin',
      featureParams: { mode: 'description', news_lang: 'tr', news_category: 'teknoloji' },
    });
    const req = requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(req.body as string)).toEqual({
      featureType: 'NEWS',
      inputText: 'metin',
      featureParams: { mode: 'description', news_lang: 'tr', news_category: 'teknoloji' },
    });
  });

  it('dosya yolunu multipart olarak, featureParams’ı JSON string olarak yükler', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'appress-sdk-'));
    const path = join(dir, 'kayit.mp3');
    await writeFile(path, Buffer.from('ses verisi'));
    const { fetch, requests } = mockFetch(ok(generation({ featureType: 'TRANSCRIPTION', inputType: 'FILE' }), 202));

    await client(fetch).generations.create({ featureType: 'TRANSCRIPTION', file: path, featureParams: { stt_lang: 'tr' } });

    const form = requests[0]!.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('featureType')).toBe('TRANSCRIPTION');
    expect(form.get('featureParams')).toBe('{"stt_lang":"tr"}');
    const file = form.get('file') as File;
    expect(file.name).toBe('kayit.mp3');
    expect(file.type).toBe('audio/mpeg');
    expect(await file.text()).toBe('ses verisi');
    // Content-Type sınırını fetch belirler; SDK elle yazmamalı.
    expect(requests[0]!.headers.get('content-type')).toBeNull();
  });

  it('bellekteki veriyi dosya adıyla yükler', async () => {
    const { fetch, requests } = mockFetch(ok(generation(), 202));
    await client(fetch).generations.create({
      featureType: 'PROOFREADING',
      file: { data: new TextEncoder().encode('metin'), fileName: 'not.txt' },
    });
    const file = (requests[0]!.body as FormData).get('file') as File;
    expect(file.name).toBe('not.txt');
    expect(file.type).toBe('text/plain');
  });

  it('event modunu girdisiz gönderir', async () => {
    const { fetch, requests } = mockFetch(ok(generation(), 202));
    await client(fetch).generations.create({
      featureType: 'PRESS_RELEASE',
      featureParams: {
        mode: 'event',
        event: { description: 'Lansman', news_category: 'teknoloji', tone: 'Objective', language: 'tr' },
      },
    });
    expect(JSON.parse(requests[0]!.body as string)).not.toHaveProperty('inputText');
  });
});

describe('generations.waitForCompletion', () => {
  it('son duruma kadar sorgular ve ilerlemeyi bildirir', async () => {
    const { fetch, requests } = mockFetch(
      ok(generation({ status: 'PENDING' })),
      ok(generation({ status: 'PROCESSING', progress: { step: 'stt', percent: 40 } })),
      ok(generation({ status: 'COMPLETED', result: { text: 'haber' }, actualCostUsd: '0.180000' })),
    );
    const seen: string[] = [];
    const result = await client(fetch).generations.waitForCompletion('id', {
      pollIntervalMs: 1,
      onProgress: (g) => seen.push(g.status),
    });
    expect(result.result).toEqual({ text: 'haber' });
    expect(seen).toEqual(['PENDING', 'PROCESSING', 'COMPLETED']);
    expect(requests).toHaveLength(3);
  });

  it('ERROR durumunu hata atmadan döndürür', async () => {
    const { fetch } = mockFetch(ok(generation({ status: 'ERROR', error: 'Ses çözümlenemedi' })));
    const result = await client(fetch).generations.waitForCompletion('id');
    expect(result).toMatchObject({ status: 'ERROR', error: 'Ses çözümlenemedi' });
  });

  it('süre dolunca WaitTimeoutError atar', async () => {
    const { fetch } = mockFetch(ok(generation({ status: 'PROCESSING' })));
    await expect(
      client(fetch).generations.waitForCompletion('id', { pollIntervalMs: 1, waitTimeoutMs: 5 }),
    ).rejects.toBeInstanceOf(WaitTimeoutError);
  });

  it('createAndWait üretir ve bekler', async () => {
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
  it('tüm sayfaları dolaşır', async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => generation({ id: `g${i}` }));
    const { fetch, requests } = mockFetch(ok({ items: page(2), total: 3 }), ok({ items: page(1), total: 3 }));
    const ids: string[] = [];
    for await (const g of client(fetch).generations.iterate({ take: 2 })) ids.push(g.id);
    expect(ids).toHaveLength(3);
    expect(requests.map((r) => r.url.searchParams.get('skip'))).toEqual(['0', '2']);
  });
});

describe('liveTranscriptions', () => {
  it('create ve extend Idempotency-Key gönderir', async () => {
    const { fetch, requests } = mockFetch(ok(liveSession(), 202), ok(liveSession({ maxDurationMinutes: 150 })));
    const live = client(fetch).liveTranscriptions;
    const session = await live.create({ url: 'https://www.youtube.com/watch?v=x', maxDurationMinutes: 120 });
    await live.extend(session.id, { totalDurationMinutes: 150 });
    expect(requests[0]!.url.pathname).toBe('/v1/live-transcriptions');
    expect(requests[1]!.url.pathname).toBe(`/v1/live-transcriptions/${session.id}/extend`);
    for (const req of requests) expect(req.headers.get('idempotency-key')).toBeTruthy();
  });

  it('stop Idempotency-Key gerektirmez', async () => {
    const { fetch, requests } = mockFetch(ok(liveSession({ state: 'STOPPING' }), 202));
    await client(fetch).liveTranscriptions.stop('id');
    expect(requests[0]!.headers.get('idempotency-key')).toBeNull();
  });

  it('streamTurns yalnız kesinleşen turları bir kez yayınlar ve oturum bitince durur', async () => {
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
      ok(liveSession({ turns: [turn('a', 'Merha', false, 1)] })),
      ok(liveSession({ turns: [turn('a', 'Merhaba', true, 2), turn('b', 'Bugün', false, 3)] })),
      ok(liveSession({ state: 'COMPLETED', turns: [turn('a', 'Merhaba', true, 2), turn('b', 'Bugün hava', true, 4)] })),
    );
    const texts: string[] = [];
    for await (const t of client(fetch).liveTranscriptions.streamTurns('id', { pollIntervalMs: 1 })) texts.push(t.text);
    expect(texts).toEqual(['Merhaba', 'Bugün hava']);
  });

  it('streamTurns includePartial ile ara metinleri de yayınlar', async () => {
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
      ok(liveSession({ turns: [turn('Mer', false)] })),
      ok(liveSession({ turns: [turn('Mer', false)] })),
      ok(liveSession({ state: 'COMPLETED', turns: [turn('Merhaba', true)] })),
    );
    const texts: string[] = [];
    const stream = client(fetch).liveTranscriptions.streamTurns('id', { pollIntervalMs: 1, includePartial: true });
    for await (const t of stream) texts.push(t.text);
    expect(texts).toEqual(['Mer', 'Merhaba']);
  });
});

describe('tip güvenliği (tsc ile denetlenir)', () => {
  it('geçersiz kombinasyonları derleme zamanında reddeder', () => {
    const valid: GenerationCreateParams[] = [
      { featureType: 'TRANSCRIPTION', inputUrl: 'https://example.com/a.mp3' },
      { featureType: 'PROOFREADING', inputText: 'x', featureParams: { language: 'intl' } },
    ];
    // @ts-expect-error iki girdi aynı anda verilemez
    const twoInputs: GenerationCreateParams = { featureType: 'NEWS', inputText: 'x', inputUrl: 'https://x' };
    // @ts-expect-error normal modda girdi zorunlu
    const noInput: GenerationCreateParams = { featureType: 'TRANSCRIPTION' };
    const badCategory: GenerationCreateParams = {
      featureType: 'NEWS',
      inputText: 'x',
      // @ts-expect-error kategori slug listesinden olmalı
      featureParams: { news_category: 'sports' },
    };
    // @ts-expect-error canlı yayın /v1/generations ile başlatılmaz
    const live: GenerationCreateParams = { featureType: 'LIVE_TRANSCRIPTION', inputUrl: 'https://x' };
    expect([valid, twoInputs, noInput, badCategory, live]).toHaveLength(5);
  });
});
