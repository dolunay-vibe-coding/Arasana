
const API_BASE = "https://ezanvakti.emushaf.net";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Yalnızca GET isteği destekleniyor."
    });
  }

  const { action, cityId, districtId } = req.query;

  let endpoint;

  if (action === "cities") {
    endpoint = `${API_BASE}/sehirler/2`;
  } else if (action === "districts") {
    if (!/^\d+$/.test(cityId || "")) {
      return res.status(400).json({
        error: "Geçerli bir şehir kodu gerekli."
      });
    }

    endpoint = `${API_BASE}/ilceler/${cityId}`;
  } else if (action === "times") {
    if (!/^\d+$/.test(districtId || "")) {
      return res.status(400).json({
        error: "Geçerli bir ilçe kodu gerekli."
      });
    }

    endpoint = `${API_BASE}/vakitler/${districtId}`;
  } else {
    return res.status(400).json({
      error: "Geçersiz işlem. cities, districts veya times kullanın."
    });
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      throw new Error(`EzanVakti API HTTP ${response.status}`);
    }

    const data = await response.json();

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
    console.error("Prayer API error:", error);

    return res.status(502).json({
      success: false,
      error: "Namaz vakitleri servisine şu anda ulaşılamıyor."
    });
  }
}
