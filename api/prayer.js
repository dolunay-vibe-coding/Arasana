
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
      error: "Geçersiz action."
    });
  }

  try {
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

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
