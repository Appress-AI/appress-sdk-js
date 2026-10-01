import type { GenerationResult, SpeakerTurnAttributes, TimedWord, TranscriptLineAttributes } from './types.js';

/** Plain text of a generation result (concatenated text inserts). */
export function getResultText(result: GenerationResult | undefined | null): string {
  if (!result || !Array.isArray(result.ops)) return '';
  return result.ops.map((op) => (typeof op.insert === 'string' ? op.insert : '')).join('');
}

export interface SpeakerTurn extends SpeakerTurnAttributes {
  text: string;
}

/** DIARIZATION result as speaker turns. Ops without a `speaker` attribute are skipped. */
export function getSpeakerTurns(result: GenerationResult | undefined | null): SpeakerTurn[] {
  if (!result || !Array.isArray(result.ops)) return [];
  const turns: SpeakerTurn[] = [];
  for (const op of result.ops) {
    const attributes = op.attributes as Partial<SpeakerTurnAttributes> | undefined;
    if (typeof op.insert !== 'string' || typeof attributes?.speaker !== 'string') continue;
    turns.push({
      speaker: attributes.speaker,
      start: attributes.start ?? '',
      end: attributes.end ?? '',
      color: attributes.color ?? '',
      ...(attributes.words ? { words: attributes.words } : {}),
      text: op.insert.trim(),
    });
  }
  return turns;
}

/**
 * Every word timing in a TRANSCRIPTION or DIARIZATION result, in order.
 * Empty when the provider returned no timings or the transcript was translated.
 */
export function getTimedWords(result: GenerationResult | undefined | null): TimedWord[] {
  if (!result || !Array.isArray(result.ops)) return [];
  return result.ops.flatMap((op) => {
    const words = (op.attributes as TranscriptLineAttributes | undefined)?.words;
    return Array.isArray(words) ? words : [];
  });
}
