
// ARASANA LIVE MATCH API
// GOAL API: canlı maçlar + bugünkü tamamlanmış maçlar

const BASE_URL = "https://api.goal-api.com/v1";

const STOP_WORDS = [
  "mac", "maci", "maclar", "skor", "skoru", "canli",
  "futbol", "sonuc", "sonuclari", "kac", "kacta",
  "bugun", "bugunku", "durum", "match", "matches",
  "live", "football", "score", "scores", "nedir",
  "ne", "oldu", "bitti", "mi", "mu", "kaç", "maç",
  "maçı", "canlı", "sonuç"
];

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

function getTokens(query) {
  return normalize(query)
    .split(" ")
    .filter(word => word.length > 1 && !STOP_WORDS.includes(word));
}

function getArray(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.matches)) return payload.data.matches;
  if (Array.isArray(payload?.matches)) return payload.matches;
  return [];
}

function getTeamName(match, side) {
  return (
    match[`${side}TeamName`] ||
    match[`${side}Team`]?.name ||
    match[`${side}_team_name`] ||
    (side === "home" ? "Ev sahibi" : "Deplasman")
  );
}

function filterMatches(matches, tokens) {
  if (!tokens.length) return matches;

  return matches.filter(match => {
    const teams = normalize(
      `${getTeamName(match, "home")} ${getTeamName(match, "away")}`
    );

    return tokens.every(token => teams.includes(token));
  });
}

async function fetchProvider(path, apiKey) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  });

  if (response.status === 204) return [];

  const payload = await response.json();

  if (!response.ok || payload.success === false) {
    const error = new Error(
      payload?.error?.message ||
      payload?.message ||
      `GOAL API HTTP ${response.status}`
    );

    error.status = response.status;
    throw error;
  }

  return getArray(payload);
}

function normalizeMatch(match, finishedFallback = false) {
  const period = String(match.matchPeriod || "").toUpperCase();
  const rawStatus = String(match.matchStatus || "").toUpperCase();

  const finished =
    finishedFallback ||
    rawStatus.includes("FINISHED") ||
    rawStatus === "FT" ||
    period === "FINISHED";

  return {
    id: match.id || match.apiId || "",
    homeTeam: getTeamName(match, "home"),
    awayTeam: getTeamName(match, "away"),
    homeScore: match.homeTeamScore ?? match.home_team_score ?? null,
    awayScore: match.awayTeamScore ?? match.away_team_score ?? null,
    league: match.leagueName || match.league?.name || "",
    country: match.countryName || "",
    status: finished ? "FINISHED" : (rawStatus || period || "UNKNOWN"),
    period,
    minute: match.matchMinute ?? match.matchElapsed ?? null,
    extra: match.matchExtra ?? null,
    kickoffUtc: match.kickoffUtc || null,
    homeBadge: match.teamHomeBadge || match.homeTeam?.badge || "",
    awayBadge: match.teamAwayBadge || match.awayTeam?.badge || "",
    leagueLogo: match.leagueLogo || match.league?.logo || "",
    events: Array.isArray(match.events) ? match.events : []
  };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=120"
  );

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
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

  const query = String(req.query?.q || "").trim();

  if (!query || query.length > 120) {
    return res.status(400).json({
      success: false,
      error: "Geçerli bir arama sorgusu gerekli."
    });
  }

  const tokens = getTokens(query);

  try {
    // Önce canlı maçlar kontrol edilir.
    const liveMatches = await fetchProvider("/fixtures/live", apiKey);
    const filteredLive = filterMatches(liveMatches, tokens);

    if (filteredLive.length) {
      return res.status(200).json({
        success: true,
        source: "GOAL API",
        matchType: "LIVE",
        matches: filteredLive.slice(0, 5).map(match =>
          normalizeMatch(match)
        ),
        count: Math.min(filteredLive.length, 5)
      });
    }

    // Takıma ait canlı maç bulunamazsa bugünkü sonuçlar kontrol edilir.
    if (tokens.length) {
      try {
        const results = await fetchProvider("/results/today", apiKey);
        const filteredResults = filterMatches(results, tokens);

        if (filteredResults.length) {
          return res.status(200).json({
            success: true,
            source: "GOAL API",
            matchType: "FINISHED",
            matches: filteredResults.slice(0, 5).map(match =>
              normalizeMatch(match, true)
            ),
            count: Math.min(filteredResults.length, 5)
          });
        }
      } catch (resultsError) {
        console.error("GOAL API sonuç sorgusu:", resultsError.message);
      }
    }

    return res.status(200).json({
      success: true,
      source: "GOAL API",
      matchType: "NONE",
      matches: [],
      count: 0
    });

  } catch (error) {
    console.error("ARASANA LIVE MATCH:", error.message);

    return res.status(502).json({
      success: false,
      error: "Maç verileri şu anda alınamıyor."
    });
  }
}
