// ARASANA - Namaz Vakitleri API (Vercel Serverless)
// Dosya yolu: api/prayer.js
// Kullanım:
//   /api/prayer?action=cities
//   /api/prayer?action=districts&cityId=541
//   /api/prayer?action=times&districtId=9541

// Diyanet verisini sunan açık yansılar (sırayla denenir)
const SOURCES = [
  'https://ezanvakti.emushaf.net',
  'https://ezanvakti.herokuapp.com'
];

const TURKEY_ID = 2;

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (compatible; ArasanaPrayer/1.0)'
};

async function fetchFromSources(path) {
  let lastError = new Error('Kaynak yanıt vermedi.');

  for (const base of SOURCES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(base + path, {
        headers: HEADERS,
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!response.ok) throw new Error('Kaynak HTTP ' + response.status);

      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Kaynak boş veri döndürdü.');
      }
      return data;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const { action, cityId, districtId } = req.query || {};
    const isId = value => /^\d{1,6}$/.test(String(value || ''));

    let data;
    let cacheSeconds;

    if (action === 'cities') {
      data = await fetchFromSources(`/sehirler/${TURKEY_ID}`);
      cacheSeconds = 86400;
    } else if (action === 'districts') {
      if (!isId(cityId)) throw new Error('Geçersiz il.');
      data = await fetchFromSources(`/ilceler/${cityId}`);
      cacheSeconds = 86400;
    } else if (action === 'times') {
      if (!isId(districtId)) throw new Error('Geçersiz ilçe.');
      data = await fetchFromSources(`/vakitler/${districtId}`);
      cacheSeconds = 3600;
    } else {
      res.status(400).json({ ok: false, error: 'Geçersiz işlem.' });
      return;
    }

    res.setHeader(
      'Cache-Control',
      `s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`
    );
    res.status(200).json({ ok: true, data });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error.message || 'Namaz vakitleri alınamadı.'
    });
  }
}
