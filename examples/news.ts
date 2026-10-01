// Run: APPRESS_API_KEY=... npx tsx examples/news.ts
// NOTE: spends real API credit.
import { Appress, InsufficientCreditError } from '../src/index.js';

const appress = new Appress();

try {
  const news = await appress.generations.createAndWait(
    {
      featureType: 'NEWS',
      inputText: 'Appress announced a new version of its AI-powered content generation platform.',
      featureParams: { news_lang: 'en', tone: 'Objective', news_category: 'teknoloji' },
    },
    { onProgress: (g) => console.log(g.status, g.progress.step ?? '') },
  );
  console.log(JSON.stringify(news, null, 2));
} catch (error) {
  if (error instanceof InsufficientCreditError) console.error('Not enough API credit; nothing was charged.');
  else throw error;
}
