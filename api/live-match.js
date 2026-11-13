
// ARASANA LIVE MATCH API
// GOAL API üzerinden canlı futbol maçlarını getirir.
// API anahtarı yalnızca Vercel sunucusunda tutulur.

const API_URL = "https://api.goal-api.com/v1/fixtures/live";

function normalize(value = "") {
  return String(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = [
  "mac", "maci", "skor", "canli", "futbol",
  "sonuc", "sonucu", "kac", "kacta", "ne",
  "durum", "bugun", "bugunku", "maç", "maçı"
];

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      error: "Sadece GET istekleri kabul edilir."
    });
  }

  const apiKey = process.env.GOAL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "GOAL_API_KEY ortam değişkeni bulunamadı."
    });
  }

  const query = String(req.query?.q || "").trim();

  if (!query || query.length > 120) {
    return res.status(400).json({
      success: false,
      error: "Geçerli bir maç veya takım adı girilmelidir."
    });
  }

  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });

    if (response.status === 204) {
      return res.status(200).json({
        success: true,
        matches: [],
        message: "Şu anda canlı maç bulunmuyor."
      });
    }

    const payload = await response.json();

    if (!response.ok || payload.success === false) {
      console.error("GOAL API yanıtı:", response.status);

      return res.status(
        response.status === 401 ? 502 : response.status
      ).json({
        success: false,
        error:
          response.status === 401
            ? "GOAL API anahtarı geçersiz."
            : response.status === 429
            ? "API istek kotası dolmuş."
            : "Maç verileri alınamadı."
      });
    }

    const allMatches = Array.isArray(payload.data)
      ? payload.data
      : [];

    const ignored = new Set(STOP_WORDS);
    const words = normalize(query)
      .split(" ")
      .filter(word => word.length > 1 && !ignored.has(word));

    if (!words.length) {
      return res.status(400).json({
        success: false,
        error: "Lütfen bir takım adı yazın."
      });
    }

    const matches = allMatches
      .filter(match => {
        const teams = normalize(
          `${match.homeTeamName || ""} ${match.awayTeamName || ""}`
        );

        return words.every(word => teams.includes(word));
      })
      .slice(0, 5)
      .map(match => ({
        id: match.id,
        homeTeam: match.homeTeamName || "Ev sahibi",
        awayTeam: match.awayTeamName || "Deplasman",
        homeScore: match.homeTeamScore ?? null,
        awayScore: match.awayTeamScore ?? null,
        league: match.leagueName || "",
        country: match.countryName || "",
        status: match.matchStatus || "",
        period: match.matchPeriod || "",
        minute: match.matchMinute ?? match.matchElapsed ?? null,
        extra: match.matchExtra ?? null,
        clockUpdatedAt: match.clockUpdatedAt || null,
        kickoffUtc: match.kickoffUtc || null
      }));

    // CDN önbelleği: aynı aramalar API kotasını daha az tüketir.
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=30, stale-while-revalidate=60"
    );

    return res.status(200).json({
      success: true,
      source: "GOAL API",
      matches,
      count: matches.length
    });

  } catch (error) {
    console.error("ARASANA LIVE MATCH:", error);

    return res.status(500).json({
      success: false,
      error: "Canlı maç servisine şu anda ulaşılamıyor."
    });
  }
}
