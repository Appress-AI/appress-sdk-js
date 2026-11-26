// Webhook signature verification. Zero dependencies: uses the Web Crypto API
// (`globalThis.crypto.subtle`), available in Node.js 20+, Deno, Bun and edge runtimes.

import { WEBHOOK_EVENT_TYPES } from './constants.js';
import { AppressError } from './errors.js';
import type { WebhookEvent } from './types.js';

export const WEBHOOK_ID_HEADER = 'appress-webhook-id';
export const WEBHOOK_TIMESTAMP_HEADER = 'appress-webhook-timestamp';
export const WEBHOOK_SIGNATURE_HEADER = 'appress-webhook-signature';
/** Default maximum age of a delivery, in seconds. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

/** The delivery could not be verified; respond with a non-2xx status and do not process it. */
export class WebhookVerificationError extends AppressError {}

export type WebhookHeaders =
  | Headers
  | Record<string, string | string[] | undefined>
  | Iterable<[string, string]>;

export interface VerifyWebhookOptions {
  /** Maximum allowed difference between the delivery timestamp and now (seconds). Default 300. */
  toleranceSeconds?: number;
  /** Current time as Unix seconds (for tests). Defaults to `Date.now()`. */
  now?: number;
}

const encoder = new TextEncoder();

function readHeader(headers: WebhookHeaders, name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name) ?? undefined;
  const entries: Iterable<[string, unknown]> =
    Symbol.iterator in Object(headers)
      ? (headers as Iterable<[string, string]>)
      : Object.entries(headers as Record<string, unknown>);
  for (const [key, value] of entries) {
    if (key.toLowerCase() !== name) continue;
    if (Array.isArray(value)) return value.join(' ');
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(secret: string, payload: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new WebhookVerificationError('Web Crypto API is not available in this runtime');
  const key = await subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return toHex(await subtle.sign('HMAC', key, payload as Uint8Array<ArrayBuffer>));
}

/**
 * Verifies a webhook delivery and returns the parsed event.
 *
 * Pass the request body exactly as received (string or bytes), before any JSON parsing.
 * `secret` may be an array to accept several secrets (for example while you roll out a new one).
 * Throws `WebhookVerificationError` when headers are missing, the timestamp is outside the
 * tolerance or no signature matches.
 *
 * ```ts
 * const event = await verifyWebhook(rawBody, request.headers, process.env.APPRESS_WEBHOOK_SECRET!);
 * if (event.type === 'generation.completed') { ... }
 * ```
 */
export async function verifyWebhook(
  payload: string | Uint8Array,
  headers: WebhookHeaders,
  secret: string | readonly string[],
  options: VerifyWebhookOptions = {},
): Promise<WebhookEvent> {
  const secrets = (typeof secret === 'string' ? [secret] : [...secret]).filter(Boolean);
  if (secrets.length === 0) throw new WebhookVerificationError('Missing webhook secret');

  const id = readHeader(headers, WEBHOOK_ID_HEADER);
  const timestampHeader = readHeader(headers, WEBHOOK_TIMESTAMP_HEADER);
  const signatureHeader = readHeader(headers, WEBHOOK_SIGNATURE_HEADER);
  if (!id || !timestampHeader || !signatureHeader) {
    throw new WebhookVerificationError('Missing webhook id, timestamp or signature header');
  }

  const timestamp = Number(timestampHeader);
  if (!/^\d+$/.test(timestampHeader.trim()) || !Number.isSafeInteger(timestamp)) {
    throw new WebhookVerificationError('Invalid webhook timestamp');
  }
  const tolerance = options.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    throw new WebhookVerificationError('Webhook timestamp is outside the tolerance');
  }

  const body = typeof payload === 'string' ? encoder.encode(payload) : payload;
  const prefix = encoder.encode(`${timestamp}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);

  const given = signatureHeader
    .split(/[\s,]+/)
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));
  let matched = false;
  for (const candidate of secrets) {
    const expected = await sign(candidate, signed);
    for (const value of given) if (constantTimeEqual(value, expected)) matched = true;
  }
  if (!matched) throw new WebhookVerificationError('No matching webhook signature');

  const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
  let event: WebhookEvent;
  try {
    event = JSON.parse(text) as WebhookEvent;
  } catch (cause) {
    throw new WebhookVerificationError('Webhook body is not valid JSON', { cause });
  }
  if (event?.id !== id) throw new WebhookVerificationError('Webhook id header does not match the body');
  return event;
}

/** `true` for event types this SDK version knows; newer types may be delivered. */
export function isKnownWebhookEventType(type: string): type is (typeof WEBHOOK_EVENT_TYPES)[number] {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(type);
}
