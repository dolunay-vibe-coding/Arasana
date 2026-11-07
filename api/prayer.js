const API_BASE = "https://ezanvakti.emushaf.net";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "GET isteği gerekli."
    });
  }

  const { action, cityId, districtId } = req.query;

  let endpoint;

  if (action === "cities") {
    endpoint = `${API_BASE}/sehirler/2`;
  } else if (action === "districts") {
    if (!/^\d+$/.test(cityId || "")) {
      return res.status(400).json({
        success: false,
        error: "Şehir kodu geçersiz."
      });
    }

    endpoint = `${API_BASE}/ilceler/${cityId}`;
  } else if (action === "times") {
    if (!/^\d+$/.test(districtId || "")) {
      return res.status(400).json({
        success: false,
        error: "İlçe kodu geçersiz."
      });
    }

    endpoint = `${API_BASE}/vakitler/${districtId}`;
  } else {
    return res.status(400).json({
      success: false,
      error: "Geçersiz işlem."
    });
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://arasana.vercel.app/",
        "Origin": "https://arasana.vercel.app"
      }
    });

    const responseText = await response.text();

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: "EzanVakti API isteği reddedildi.",
        status: response.status,
        details: responseText.slice(0, 1000),
        endpoint
      });
    }

    const data = JSON.parse(responseText);

    if (!Array.isArray(data)) {
      throw new Error("API beklenen liste biçiminde yanıt vermedi.");
    }

    res.setHeader(
      "Cache-Control",
      action === "times"
        ? "s-maxage=3600, stale-while-revalidate=86400"
        : "s-maxage=86400, stale-while-revalidate=604800"
    );

    return res.status(200).json({
      success: true,
      source: "EzanVakti API",
      data
    });

  } catch (error) {
    console.error("PRAYER ERROR:", error);

    return res.status(502).json({
      success: false,
      error: "Namaz vakti bağlantı hatası.",
      details: error.message,
      endpoint
    });
  }
}
