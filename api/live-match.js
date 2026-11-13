
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Sadece GET isteği kabul edilir."
    });
  }

  const apiKey = process.env.GOAL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "GOAL_API_KEY bulunamadı."
    });
  }

  try {
    const response = await fetch(
      "https://api.goal-api.com/v1/fixtures/live",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json"
        }
      }
    );

    const raw = await response.text();

    let payload;

    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { rawResponse: raw.slice(0, 500) };
    }

    if (!response.ok || payload.success === false) {
      console.error("GOAL API HATA:", response.status, payload);

      return res.status(502).json({
        success: false,
        error: "GOAL API isteği başarısız.",
        providerStatus: response.status,
        providerMessage:
          payload.error?.message ||
          payload.error ||
          payload.message ||
          payload.code ||
          "API hata ayrıntısı döndürmedi."
      });
    }

    return res.status(200).json({
      success: true,
      source: "GOAL API",
      matches: payload.data || [],
      count: Array.isArray(payload.data)
        ? payload.data.length
        : 0
    });

  } catch (error) {
    console.error("ARASANA LIVE MATCH:", error);

    return res.status(500).json({
      success: false,
      error: "Sunucu bağlantı hatası."
    });
  }
}
