
const API_BASE = "https://namazvakti.mtopal.dev";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: "Yalnızca GET destekleniyor."
    });
  }

  const { action, cityId, districtId } = req.query;

  let endpoint;
  let cacheTime;

  if (action === "cities") {
    // Türkiye'nin 81 ili
    endpoint = `${API_BASE}/sehirler/2`;
    cacheTime = 86400;

  } else if (action === "districts") {
    if (!/^\d+$/.test(cityId || "")) {
      return res.status(400).json({
        ok: false,
        error: "Geçerli bir il kodu gerekli."
      });
    }

    endpoint = `${API_BASE}/ilceler/${cityId}`;
    cacheTime = 86400;

  } else if (action === "times") {
    if (!/^\d+$/.test(districtId || "")) {
      return res.status(400).json({
        ok: false,
        error: "Geçerli bir ilçe kodu gerekli."
      });
    }

    endpoint = `${API_BASE}/vakitler/${districtId}`;
    cacheTime = 3600;

  } else {
    return res.status(400).json({
      ok: false,
      error: "Geçersiz işlem."
    });
  }

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`API HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("API geçerli veri döndürmedi.");
    }

    res.setHeader(
      "Cache-Control",
      `s-maxage=${cacheTime}, stale-while-revalidate=86400`
    );

    return res.status(200).json({
      ok: true,
      source: "Diyanet verileri - Namaz Vakti API",
      action,
      data
    });

  } catch (error) {
    console.error("ARASANA PRAYER ERROR:", error);

    return res.status(502).json({
      ok: false,
      error: "Namaz vakitleri şu anda alınamıyor.",
      details: error.message
    });
  }
}
