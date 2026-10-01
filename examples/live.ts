// Run: APPRESS_API_KEY=... npx tsx examples/live.ts <stream-url>
// NOTE: reserves API credit for the chosen duration.
import { Appress } from '../src/index.js';

const url = process.argv[2];
if (!url) throw new Error('Usage: examples/live.ts <stream-url>');

const appress = new Appress();
const session = await appress.liveTranscriptions.create({ url, maxDurationMinutes: 15 });
console.log('Session:', session.id);

process.on('SIGINT', async () => {
  await appress.liveTranscriptions.stop(session.id);
  process.exit(0);
});

for await (const turn of appress.liveTranscriptions.streamTurns(session.id, {
  onSession: (s) => s.state === 'FAILED' && console.error(s.failureCode, s.failureMessage),
})) {
  console.log(`[${turn.speaker ?? '-'}] ${turn.text}`);
}
