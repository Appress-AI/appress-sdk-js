// Çalıştırma: APPRESS_API_KEY=... npx tsx examples/live.ts <youtube-url>
// DİKKAT: seçilen süre kadar API bakiyesi rezerve eder.
import { Appress } from '../src/index.js';

const url = process.argv[2];
if (!url) throw new Error('Kullanım: examples/live.ts <yayın-url>');

const appress = new Appress();
const session = await appress.liveTranscriptions.create({ url, maxDurationMinutes: 15 });
console.log('Oturum:', session.id);

process.on('SIGINT', async () => {
  await appress.liveTranscriptions.stop(session.id);
  process.exit(0);
});

for await (const turn of appress.liveTranscriptions.streamTurns(session.id, {
  onSession: (s) => s.state === 'FAILED' && console.error(s.failureCode, s.failureMessage),
})) {
  console.log(`[${turn.speaker ?? '-'}] ${turn.text}`);
}
