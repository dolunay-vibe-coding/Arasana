// ARASANA arama API'si — ÜCRETSİZ Serper.dev API'si kullanır
// Kredi kartı gerekmez, sadece serper.dev'den e-posta ile alınan
// ücretsiz bir anahtar yeterli (ayda 2500 ücretsiz arama hakkı).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sadece POST istekleri kabul edilir' });
  }

  const { query } = req.body || {};
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query alanı gerekli' });
  }

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, gl: 'tr', hl: 'tr' })
    });

    const data = await response.json();

    if (data.error || !response.ok) {
      return res.status(500).json({
        error: data.message || 'Serper API hatası. API anahtarını kontrol et.'
      });
    }

    let answer = '';
    if (data.answerBox) {
      answer = data.answerBox.answer || data.answerBox.snippet || '';
    } else if (data.knowledgeGraph) {
      answer = data.knowledgeGraph.description || '';
    } else if (data.organic && data.organic[0]) {
      answer = data.organic[0].snippet || '';
    }
    if (!answer) {
      answer = 'Bu sorgu için net bir özet bulunamadı, ama aşağıda eşleşen siteler var.';
    }

    const results = (data.organic || []).slice(0, 8).map(item => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet || ''
    }));

    return res.status(200).json({ answer, results });

  } catch (err) {
    console.error('ARASANA API hata:', err);
    return res.status(500).json({ error: 'Arama sırasında bir hata oluştu: ' + err.message });
  }
}
