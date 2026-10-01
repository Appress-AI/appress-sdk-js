import { describe, expect, it } from 'vitest';
import { getResultText, getSpeakerTurns, getTimedWords, type GenerationResult } from '../src/index.js';

// Shapes mirror what the API returns for each feature.
const transcript: GenerationResult = {
  ops: [
    {
      insert: 'Good morning everyone.\n',
      attributes: {
        start: '00:01',
        end: '00:03',
        words: [
          { t: 'Good', s: 1.02, e: 1.3 },
          { t: 'morning', s: 1.3, e: 1.71 },
          { t: 'everyone.', s: 1.71, e: 2.4 },
        ],
      },
    },
    { insert: '\n' },
    { insert: 'A line that could not be aligned.\n' },
  ],
};

const interview: GenerationResult = {
  ops: [
    {
      insert: 'Welcome to the show.\n\n',
      attributes: { speaker: 'A', start: '00:00', end: '00:02', color: '#2196F3', words: [{ t: 'Welcome', s: 0.1, e: 0.5 }] },
    },
    { insert: 'Thanks for having me.\n\n', attributes: { speaker: 'B', start: '00:02', end: '00:04', color: '#4CAF50' } },
  ],
};

const proofreading: GenerationResult = {
  ops: [{ insert: 'Corrected text.\n' }],
  diff: { ops: [{ retain: 10 }, { delete: 1 }, { insert: 'e' }] },
};

describe('result helpers', () => {
  it('getResultText joins text inserts', () => {
    expect(getResultText(transcript)).toBe('Good morning everyone.\n\nA line that could not be aligned.\n');
    expect(getResultText(proofreading)).toBe('Corrected text.\n');
  });

  it('getResultText tolerates missing or malformed results', () => {
    expect(getResultText(undefined)).toBe('');
    expect(getResultText({ ops: [{ insert: { image: 'x' } }, { insert: 'ok' }] })).toBe('ok');
  });

  it('getTimedWords returns word timings in order', () => {
    expect(getTimedWords(transcript).map((w) => w.t)).toEqual(['Good', 'morning', 'everyone.']);
    expect(getTimedWords(interview)).toEqual([{ t: 'Welcome', s: 0.1, e: 0.5 }]);
    expect(getTimedWords(proofreading)).toEqual([]);
  });

  it('getSpeakerTurns maps interview ops to turns', () => {
    expect(getSpeakerTurns(interview)).toEqual([
      { speaker: 'A', start: '00:00', end: '00:02', color: '#2196F3', words: [{ t: 'Welcome', s: 0.1, e: 0.5 }], text: 'Welcome to the show.' },
      { speaker: 'B', start: '00:02', end: '00:04', color: '#4CAF50', text: 'Thanks for having me.' },
    ]);
    expect(getSpeakerTurns(transcript)).toEqual([]);
  });
});
