
const BASE_URL = "https://api.goal-api.com/v1";

const STOP_WORDS = new Set([
  "mac", "maci", "maclar", "skor", "skoru", "canli",
  "futbol", "sonuc", "sonuclari", "kac", "kacta",
  "bugun", "bugunku", "durum", "match", "matches",
  "live", "football", "score", "scores", "nedir",
  "ne", "oldu", "bitti", "mi", "mu", "fikstur",
  "fiksturu", "takim", "takimi", "takimin",
  "ve", "ile", "karsi", "arasindaki"
]);

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
  return [...new Set(
    normalize(query)
      .split(" ")
      .filter(word => word.length >= 3 && !STOP_WORDS.has(word))
  )].slice(0, 5);
}

function getArray(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.matches)) return payload.data.matches;
  if (Array.isArray(payload?.matches)) return payload.matches;
  return [];
}

function getH2HMatches(payload) {
  return Array.isArray(payload?.data?.matches)
    ? payload.data.matches
    : Array.isArray(payload?.matches)
      ? payload.matches
      : [];
}

async function fetchProvider(path, apiKey) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  });

  if (response.status === 204) return {};

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

  return payload;
}

function getTeamName(match, side) {
  const team = match[`${side}Team`];

  return (
    match[`${side}TeamName`] ||
    match[`${side}_team_name`] ||
    match[`match_${side}team_name`] ||
    team?.name ||
    (side === "home" ? "Ev sahibi" : "Deplasman")
  );
}

function getTeamId(match, side) {
  return (
    match[`${side}TeamId`] ||
    match[`${side}_team_id`] ||
    match[`${side}Team`]?.id ||
    match[`match_${side}team_id`] ||
    null
  );
}

function getBadge(match, side) {
  return (
    match[side === "home" ? "teamHomeBadge" : "teamAwayBadge"] ||
    match[side === "home" ? "team_home_badge" : "team_away_badge"] ||
    match[`${side}Team`]?.badge ||
    ""
  );
}

function normalizeMatch(match, type = "UNKNOWN") {
  const rawStatus = String(
    match.matchStatus ||
    match.match_status ||
    match.status ||
    ""
  ).toUpperCase();

  const period = String(
    match.matchPeriod ||
    match.match_period ||
    match.period ||
    ""
  ).toUpperCase();

  let matchType = type;

  if (rawStatus.includes("FINISHED") || rawStatus === "FT" ||
      period === "FINISHED" || rawStatus === "AFTER_PEN") {
    matchType = "FINISHED";
  } else if (
    rawStatus === "LIVE" ||
    period === "FIRST_HALF" ||
    period === "SECOND_HALF" ||
    period === "EXTRA_TIME" ||
    period === "PENALTIES"
  ) {
    matchType = "LIVE";
  } else if (
    rawStatus.includes("SCHEDULED") ||
    rawStatus.includes("NOT_STARTED") ||
    rawStatus.includes("TIMED") ||
    rawStatus === "NS"
  ) {
    matchType = "UPCOMING";
  }

  const kickoffUtc =
    match.kickoffUtc ||
    match.kickoff_utc ||
    null;

  const matchDate =
    match.matchDate ||
    match.match_date ||
    (kickoffUtc ? kickoffUtc.slice(0, 10) : null);

  return {
    id: match.id || match.apiId || match.match_id || "",
    homeTeam: getTeamName(match, "home"),
    awayTeam: getTeamName(match, "away"),
    homeTeamId: getTeamId(match, "home"),
    awayTeamId: getTeamId(match, "away"),
    homeScore:
      match.homeTeamScore ??
      match.home_team_score ??
      match.match_hometeam_score ??
      null,
    awayScore:
      match.awayTeamScore ??
      match.away_team_score ??
      match.match_awayteam_score ??
      null,
    league:
      match.leagueName ||
      match.league_name ||
      match.league?.name ||
      "",
    country:
      match.countryName ||
      match.country_name ||
      "",
    status: matchType,
    period,
    minute:
      match.matchMinute ??
      match.matchElapsed ??
      null,
    extra: match.matchExtra ?? null,
    kickoffUtc,
    matchDate,
    matchTime:
      match.matchTime ||
      match.match_time ||
      null,
    homeBadge: getBadge(match, "home"),
    awayBadge: getBadge(match, "away"),
    leagueLogo: match.leagueLogo || match.league_logo || "",
    events: Array.isArray(match.events) ? match.events : []
  };
}

function getCurrentSeasonStart() {
  const now = new Date();
  const year = now.getUTCFullYear();

  return now.getUTCMonth() >= 6
    ? `${year}-07-01`
    : `${year - 1}-07-01`;
}

function isCurrentSeason(match) {
  const date =
    match.matchDate ||
    match.match_date ||
    match.kickoffUtc?.slice(0, 10) ||
    "";

  return date >= getCurrentSeasonStart();
}

function teamScore(team, tokens) {
  const name = normalize(team.name);
  let score = 0;

  for (const token of tokens) {
    if (name.includes(token)) score += token.length >= 5 ? 3 : 1;
  }

  return score;
}

// Takım adını sabit bir listeye bağlı kalmadan GOAL API'den bulur.
async function findTeams(query, apiKey) {
  const tokens = getTokens(query);

  if (!tokens.length) return [];

  const found = new Map();

  const searches = tokens.map(async token => {
    const path =
      `/teams?search=${encodeURIComponent(token)}` +
      `&country=Turkey&limit=20`;

    try {
      const payload = await fetchProvider(path, apiKey);

      for (const team of getArray(payload)) {
        if (!team.id || !team.name) continue;

        const score = teamScore(team, tokens);

        if (score > 0) {
          const previous = found.get(team.id);

          if (!previous || score > previous.score) {
            found.set(team.id, { ...team, score });
          }
        }
      }
    } catch (error) {
      console.error("Takım arama hatası:", error.message);
    }
  });

  await Promise.all(searches);

  return [...found.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

function sameTeam(match, team) {
  const homeId = getTeamId(match, "home");
  const awayId = getTeamId(match, "away");

  if (homeId && awayId && team.id) {
    return homeId === team.id || awayId === team.id;
  }

  const name = normalize(team.name);

  return (
    normalize(getTeamName(match, "home")).includes(name) ||
    normalize(getTeamName(match, "away")).includes(name)
  );
}

function isBetweenTeams(match, team1, team2) {
  const homeId = getTeamId(match, "home");
  const awayId = getTeamId(match, "away");

  if (homeId && awayId) {
    return (
      (homeId === team1.id && awayId === team2.id) ||
      (homeId === team2.id && awayId === team1.id)
    );
  }

  const home = normalize(getTeamName(match, "home"));
  const away = normalize(getTeamName(match, "away"));

  const first = normalize(team1.name);
  const second = normalize(team2.name);

  return (
    (home.includes(first) && away.includes(second)) ||
    (home.includes(second) && away.includes(first))
  );
}

function sortByDate(matches, direction = "asc") {
  return matches.sort((a, b) => {
    const dateA = new Date(a.kickoffUtc || a.matchDate || 0).getTime();
    const dateB = new Date(b.kickoffUtc || b.matchDate || 0).getTime();

    return direction === "desc"
      ? dateB - dateA
      : dateA - dateB;
  });
}

async function getTeamMatches(team, apiKey) {
  const [upcomingPayload, resultsPayload] = await Promise.all([
    fetchProvider(`/teams/${encodeURIComponent(team.id)}/upcoming?limit=20`, apiKey)
      .catch(error => {
        console.error("Yaklaşan maçlar:", error.message);
        return {};
      }),

    fetchProvider(`/teams/${encodeURIComponent(team.id)}/results?limit=30`, apiKey)
      .catch(error => {
        console.error("Takım sonuçları:", error.message);
        return {};
      })
  ]);

  const upcoming = getArray(upcomingPayload)
    .filter(match => sameTeam(match, team))
    .map(match => normalizeMatch(match, "UPCOMING"));

  const results = getArray(resultsPayload)
    .filter(match => sameTeam(match, team))
    .filter(isCurrentSeason)
    .map(match => normalizeMatch(match, "FINISHED"));

  return {
    upcoming: sortByDate(upcoming, "asc").slice(0, 10),
    results: sortByDate(results, "desc").slice(0, 10)
  };
}

async function getDirectMeetings(team1, team2, apiKey) {
  const path =
    `/h2h/${encodeURIComponent(team1.id)}` +
    `/${encodeURIComponent(team2.id)}/direct`;

  const payload = await fetchProvider(path, apiKey);

  return getH2HMatches(payload)
    .filter(isCurrentSeason)
    .map(match => normalizeMatch(match, "FINISHED"));
}

async function getNextMeeting(team1, team2, apiKey) {
  const payload = await fetchProvider(
    `/teams/${encodeURIComponent(team1.id)}/upcoming?limit=50`,
    apiKey
  );

  const matches = getArray(payload)
    .filter(match => isBetweenTeams(match, team1, team2))
    .map(match => normalizeMatch(match, "UPCOMING"));

  return sortByDate(matches, "asc")[0] || null;
}

async function getLiveMatches(query, apiKey) {
  const payload = await fetchProvider("/fixtures/live", apiKey);
  const matches = getArray(payload);

  const tokens = getTokens(query);

  return matches.filter(match => {
    const names = normalize(
      `${getTeamName(match, "home")} ${getTeamName(match, "away")}`
    );

    return tokens.some(token => names.includes(token));
  }).map(match => normalizeMatch(match, "LIVE"));
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

  try {
    const teams = await findTeams(query, apiKey);

    if (!teams.length) {
      return res.status(200).json({
        success: true,
        source: "GOAL API",
        mode: "NONE",
        teams: [],
        upcoming: [],
        results: [],
        headToHead: [],
        nextMeeting: null,
        matches: []
      });
    }

    // İki takım araması: ör. Galatasaray Fenerbahçe
    if (teams.length >= 2) {
      const [nextMeeting, directMeetings] = await Promise.all([
        getNextMeeting(teams[0], teams[1], apiKey)
          .catch(error => {
            console.error("Sıradaki karşılaşma:", error.message);
            return null;
          }),

        getDirectMeetings(teams[0], teams[1], apiKey)
          .catch(error => {
            console.error("İkili karşılaşmalar:", error.message);
            return [];
          })
      ]);

      const live = await getLiveMatches(query, apiKey)
        .catch(() => []);

      const allMatches = [
        ...(nextMeeting ? [nextMeeting] : []),
        ...live,
        ...sortByDate(directMeetings, "desc")
      ];

      return res.status(200).json({
        success: true,
        source: "GOAL API",
        mode: "PAIR",
        teams: teams.map(team => ({
          id: team.id,
          name: team.name,
          badge: team.badge || ""
        })),
        nextMeeting,
        headToHead: sortByDate(directMeetings, "desc").slice(0, 20),
        upcoming: nextMeeting ? [nextMeeting] : [],
        results: sortByDate(directMeetings, "desc").slice(0, 20),
        matches: allMatches,
        count: allMatches.length
      });
    }

    // Tek takım araması
    const team = teams[0];

    const [teamMatches, live] = await Promise.all([
      getTeamMatches(team, apiKey),
      getLiveMatches(query, apiKey).catch(() => [])
    ]);

    const allMatches = [
      ...live,
      ...teamMatches.upcoming,
      ...teamMatches.results
    ];

    return res.status(200).json({
      success: true,
      source: "GOAL API",
      mode: "TEAM",
      team: {
        id: team.id,
        name: team.name,
        badge: team.badge || ""
      },
      teams: [{
        id: team.id,
        name: team.name,
        badge: team.badge || ""
      }],
      upcoming: teamMatches.upcoming,
      results: teamMatches.results,
      headToHead: [],
      nextMeeting: null,
      matches: allMatches,
      count: allMatches.length
    });

  } catch (error) {
    console.error("ARASANA LIVE MATCH:", error.message);

    return res.status(error.status === 429 ? 429 : 502).json({
      success: false,
      error: error.status === 429
        ? "Maç verisi sınırına ulaşıldı. Biraz sonra tekrar dene."
        : "Maç verileri şu anda alınamıyor."
    });
  }
}
