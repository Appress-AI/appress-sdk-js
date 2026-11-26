import { describe, expect, it } from 'vitest';
import { WebhookVerificationError, verifyWebhook } from '../src/index.js';

// Shared test vector (the Python SDK uses the same values).
const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const previousSecret = 'whsec_OLDSECRETOLDSECRETOLDSECRETOLDSE';
const timestamp = 1795694400;
const rawBody =
  '{"id":"evt_00000000-0000-4000-8000-000000000001","type":"generation.completed","createdAt":"2026-11-26T12:00:00.000Z","data":{"object":"generation","id":"11111111-1111-4111-8111-111111111111","featureType":"TRANSCRIPTION","status":"COMPLETED","apiKeyId":"22222222-2222-4222-8222-222222222222","completedAt":"2026-11-26T11:59:58.000Z"}}';
const signature = 'bb2237b87769b7d49c0ec6ac6216fa12c7ad4ccb9bf77b799fbb2a604be8cbf0';
const previousSignature = '563a9f76d8af60fa2a03a4328bea05469e20dddf668a99321a86070bb5ac9e4e';

const headers = (sig = `v1=${signature}`, ts = String(timestamp)) => ({
  'Appress-Webhook-Id': 'evt_00000000-0000-4000-8000-000000000001',
  'Appress-Webhook-Timestamp': ts,
  'Appress-Webhook-Signature': sig,
});

describe('verifyWebhook', () => {
  it('accepts a valid delivery and returns the event', async () => {
    const event = await verifyWebhook(rawBody, headers(), secret, { now: timestamp + 10 });
    expect(event.type).toBe('generation.completed');
    expect(event.data).toMatchObject({ object: 'generation', status: 'COMPLETED' });
  });

  it('accepts bytes, a Headers instance and either signature during rotation', async () => {
    const both = new Headers(headers(`v1=${signature} v1=${previousSignature}`));
    const body = new TextEncoder().encode(rawBody);
    await expect(verifyWebhook(body, both, previousSecret, { now: timestamp })).resolves.toMatchObject({
      type: 'generation.completed',
    });
    await expect(verifyWebhook(body, both, [secret], { now: timestamp })).resolves.toBeTruthy();
  });

  it('rejects a modified body, a wrong secret and a stale timestamp', async () => {
    const opts = { now: timestamp };
    await expect(verifyWebhook(rawBody.replace('COMPLETED', 'FAILED'), headers(), secret, opts)).rejects.toThrow(
      WebhookVerificationError,
    );
    await expect(verifyWebhook(rawBody, headers(), 'whsec_wrong', opts)).rejects.toThrow(WebhookVerificationError);
    await expect(verifyWebhook(rawBody, headers(), secret, { now: timestamp + 301 })).rejects.toThrow(
      /tolerance/,
    );
  });

  it('rejects missing headers and an id that does not match the body', async () => {
    await expect(
      verifyWebhook(rawBody, { 'Appress-Webhook-Timestamp': String(timestamp) }, secret, { now: timestamp }),
    ).rejects.toThrow(/Missing/);
    await expect(
      verifyWebhook(rawBody, { ...headers(), 'Appress-Webhook-Id': 'evt_other' }, secret, { now: timestamp }),
    ).rejects.toThrow(/id/);
  });
});
