// Çalıştırma: APPRESS_API_KEY=... npx tsx examples/news.ts
// DİKKAT: gerçek API bakiyesi harcar.
import { Appress, InsufficientCreditError } from '../src/index.js';

const appress = new Appress();

try {
  const news = await appress.generations.createAndWait(
    {
      featureType: 'NEWS',
      inputText: 'Appress, yapay zekâ destekli içerik üretim platformunun yeni sürümünü duyurdu.',
      featureParams: { news_lang: 'tr', tone: 'Objective', news_category: 'teknoloji' },
    },
    { onProgress: (g) => console.log(g.status, g.progress.step ?? '') },
  );
  console.log(JSON.stringify(news, null, 2));
} catch (error) {
  if (error instanceof InsufficientCreditError) console.error('Bakiye yetersiz, ücret alınmadı.');
  else throw error;
}
