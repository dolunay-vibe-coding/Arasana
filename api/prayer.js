
const API_BASE = "https://idamedya.org/api/v1";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      ok: false,
      error: "Yalnızca GET isteği destekleniyor."
    });
  }

  const { action, cityId, districtId } = req.query;

  let endpoint;
  let cacheTime;

  if (action === "cities") {
    endpoint = `${API_BASE}/namaz/iller`;
    cacheTime = 86400;

  } else if (action === "districts") {
    if (!/^\d+$/.test(cityId || "")) {
      return res.status(400).json({
        ok: false,
        error: "Geçerli bir şehir kodu gerekli."
      });
    }

    endpoint = `${API_BASE}/namaz/ilceler/${cityId}`;
    cacheTime = 86400;

  } else if (action === "times") {
    if (!/^\d+$/.test(districtId || "")) {
      return res.status(400).json({
        ok: false,
        error: "Geçerli bir ilçe vakit kodu gerekli."
      });
    }

    endpoint = `${API_BASE}/namaz/${districtId}`;
    cacheTime = 3600;

  } else {
    return res.status(400).json({
      ok: false,
      error: "Geçersiz işlem. cities, districts veya times kullanın."
    });
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`API HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.ok !== true || result.data === undefined) {
      throw new Error(result.error || "API geçersiz yanıt döndürdü.");
    }

    res.setHeader(
      "Cache-Control",
      `s-maxage=${cacheTime}, stale-while-revalidate=86400`
    );

    return res.status(200).json({
      ok: true,
      source: "İdame Medya",
      action,
      data: result.data
    });

  } catch (error) {
    console.error("ARASANA PRAYER ERROR:", error);

    return res.status(502).json({
      ok: false,
      error: "Namaz vakitleri servisine ulaşılamadı.",
      details: error.message
    });
  }
}
