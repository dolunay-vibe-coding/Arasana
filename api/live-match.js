
const BASE_URL = "https://api.goal-api.com/v1";

const ALIASES = {
  gs: "Galatasaray",
  cimbom: "Galatasaray",
  fb: "Fenerbahçe",
  fener: "Fenerbahçe",
  bjk: "Beşiktaş",
  ts: "Trabzonspor",
  amed: "Amed Sportif Faaliyetler",
  amedspor: "Amed Sportif Faaliyetler",
  erzurum: "Erzurumspor FK",
  corum: "Arca Çorum FK",
  antep: "Gaziantep Futbol Kulübü",
  samsun: "Samsunspor",
  goztepe: "Göztepe"
};

const STOP_WORDS = new Set([
  "mac", "maci", "maclar", "skor", "skoru",
  "canli", "futbol", "sonuc", "sonuclari",
  "bugun", "bugunku", "match", "matches",
  "live", "football", "score", "scores",
  "fikstur", "fiksturu", "takim", "takimi",
  "karsi", "arasindaki", "ve", "ile"
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

function expandAliases(query) {
  return normalize(query)
    .split(" ")
    .map(word => normalize(ALIASES[word] || word))
    .join(" ");
}

function getTokens(query) {
  return [...new Set(
    expandAliases(query)
      .split(" ")
      .filter(word =>
        word.length >= 3 && !STOP_WORDS.has(word)
      )
  )].slice(0, 5);
}

function getArray(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.matches)) return payload.data.matches;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function fetchProvider(path, apiKey) {
  const response = await fetch(`${BASE_URL}${path}`, {
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
      payload?.error ||
      `GOAL API HTTP ${response.status}`
    );

    error.status = response.status;
    throw error;
  }

  return payload;
}

function teamScore(team, tokens) {
  const name = normalize(team.name);
  let score = 0;

  for (const token of tokens) {
    if (name === token) score += 10;
    else if (name.includes(token)) score += 5;
  }

  return score;
}

// DİKKAT: Artık country=Turkey filtresi yok.
async function findTeams(query, apiKey) {
  const tokens = getTokens(query);
  const found = new Map();
  const diagnostics = [];

  if (!tokens.length) {
    return { teams: [], diagnostics };
  }

  await Promise.all(tokens.map(async token => {
    const path =
      `/teams?search=${encodeURIComponent(token)}` +
      `&limit=50&isActive=true`;

    try {
      const payload = await fetchProvider(path, apiKey);
      const list = getArray(payload);

      diagnostics.push({
        searched: token,
        count: list.length,
        source: payload.source || "unknown"
      });

      for (const team of list) {
        if (!team.id || !team.name) continue;

        const score = teamScore(team, tokens);
        if (!score) continue;

        const old = found.get(team.id);

        if (!old || score > old.score) {
          found.set(team.id, {
            ...team,
            score
          });
        }
      }
    } catch (error) {
      diagnostics.push({
        searched: token,
        error: error.message,
        status: error.status || null
      });
    }
  }));

  const teams = [...found.values()]
    .sort((a, b) => b.score - a.score);

  // İki takım aramasında iki farklı takımı seç.
  return {
    teams: teams.slice(0, 2),
    diagnostics
  };
}

function getTeamName(match, side) {
  return (
    match[`${side}TeamName`] ||
    match[`${side}_team_name`] ||
    match[`${side}Team`]?.name ||
    "Bilinmeyen takım"
  );
}

function getTeamId(match, side) {
  return (
    match[`${side}TeamId`] ||
    match[`${side}_team_id`] ||
    match[`${side}Team`]?.id ||
    null
  );
}

function normalizeMatch(match, fallback = "UNKNOWN") {
  const status = String(match.matchStatus || "").toUpperCase();
  const period = String(match.matchPeriod || "").toUpperCase();

  let type = fallback;

  if (
    status === "FINISHED" ||
    status === "AFTER_ET" ||
    status === "AFTER_PEN" ||
    period === "FINISHED"
  ) {
    type = "FINISHED";
  } else if (
    status === "LIVE" ||
    period === "FIRST_HALF" ||
    period === "SECOND_HALF" ||
    period === "EXTRA_TIME" ||
    period === "PENALTIES"
  ) {
    type = "LIVE";
  } else if (
    status === "SCHEDULED" ||
    period === "NOT_STARTED"
  ) {
    type = "UPCOMING";
  }

  return {
    id: match.id || match.apiId || "",
    homeTeam: getTeamName(match, "home"),
    awayTeam: getTeamName(match, "away"),
    homeTeamId: getTeamId(match, "home"),
    awayTeamId: getTeamId(match, "away"),
    homeScore: match.homeTeamScore ?? null,
    awayScore: match.awayTeamScore ?? null,
    homeBadge: match.homeTeamBadge || "",
    awayBadge: match.awayTeamBadge || "",
    league: match.leagueName || "",
    country: match.countryName || "",
    status: type,
    period,
    minute: match.matchMinute ?? match.matchElapsed ?? null,
    extra: match.matchExtra ?? null,
    kickoffUtc: match.kickoffUtc || null,
    matchDate: match.matchDate || null,
    matchTime: match.matchTime || null
  };
}

function seasonStart() {
  const now = new Date();
  const year = now.getUTCFullYear();

  return now.getUTCMonth() >= 6
    ? `${year}-07-01`
    : `${year - 1}-07-01`;
}

function isCurrentSeason(match) {
  const date =
    match.matchDate ||
    match.kickoffUtc?.slice(0, 10) ||
    "";

  return date >= seasonStart();
}

function sortMatches(matches, direction = "asc") {
  return matches.sort((a, b) => {
    const dateA = new Date(a.kickoffUtc || a.matchDate || 0);
    const dateB = new Date(b.kickoffUtc || b.matchDate || 0);

    return direction === "desc"
      ? dateB - dateA
      : dateA - dateB;
  });
}

function belongsToTeam(match, team) {
  const homeId = getTeamId(match, "home");
  const awayId = getTeamId(match, "away");

  if (homeId && awayId) {
    return homeId === team.id || awayId === team.id;
  }

  const name = normalize(team.name);

  return (
    normalize(getTeamName(match, "home")).includes(name) ||
    normalize(getTeamName(match, "away")).includes(name)
  );
}

function belongsToPair(match, team1, team2) {
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

async function getTeamMatches(team, apiKey) {
  const [upcomingPayload, resultsPayload] = await Promise.all([
    fetchProvider(
      `/teams/${encodeURIComponent(team.id)}/upcoming?limit=30`,
      apiKey
    ),
    fetchProvider(
      `/teams/${encodeURIComponent(team.id)}/results?limit=50`,
      apiKey
    )
  ]);

  const upcoming = getArray(upcomingPayload)
    .filter(match => belongsToTeam(match, team))
    .map(match => normalizeMatch(match, "UPCOMING"));

  const results = getArray(resultsPayload)
    .filter(match => belongsToTeam(match, team))
    .filter(isCurrentSeason)
    .map(match => normalizeMatch(match, "FINISHED"));

  return {
    upcoming: sortMatches(upcoming).slice(0, 10),
    results: sortMatches(results, "desc").slice(0, 10)
  };
}

async function getPairMatches(team1, team2, apiKey) {
  const [upcomingPayload, h2hPayload] = await Promise.all([
    fetchProvider(
      `/teams/${encodeURIComponent(team1.id)}/upcoming?limit=100`,
      apiKey
    ),
    fetchProvider(
      `/h2h/${encodeURIComponent(team1.id)}/${encodeURIComponent(team2.id)}/direct`,
      apiKey
    )
  ]);

  const upcoming = getArray(upcomingPayload)
    .filter(match => belongsToPair(match, team1, team2))
    .map(match => normalizeMatch(match, "UPCOMING"));

  const history = getArray(h2hPayload)
    .filter(match => belongsToPair(match, team1, team2))
    .filter(isCurrentSeason)
    .map(match => normalizeMatch(match, "FINISHED"));

  return {
    nextMeeting: sortMatches(upcoming)[0] || null,
    headToHead: sortMatches(history, "desc").slice(0, 20)
  };
}

async function getLiveMatches(teams, apiKey) {
  const payload = await fetchProvider("/fixtures/live", apiKey);

  return getArray(payload)
    .filter(match =>
      teams.some(team => belongsToTeam(match, team))
    )
    .map(match => normalizeMatch(match, "LIVE"));
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
    const search = await findTeams(query, apiKey);
    const teams = search.teams;

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
        matches: [],
        debug: {
          searchedTokens: getTokens(query),
          teamSearch: search.diagnostics
        }
      });
    }

    const live = await getLiveMatches(teams, apiKey)
      .catch(error => {
        console.error("Canlı maç sorgusu:", error.message);
        return [];
      });

    if (teams.length >= 2) {
      const pair = await getPairMatches(
        teams[0],
        teams[1],
        apiKey
      );

      const matches = [
        ...live,
        ...(pair.nextMeeting ? [pair.nextMeeting] : []),
        ...pair.headToHead
      ];

      return res.status(200).json({
        success: true,
        source: "GOAL API",
        mode: "PAIR",
        teams,
        nextMeeting: pair.nextMeeting,
        upcoming: pair.nextMeeting ? [pair.nextMeeting] : [],
        results: pair.headToHead,
        headToHead: pair.headToHead,
        matches,
        count: matches.length
      });
    }

    const team = teams[0];
    const teamMatches = await getTeamMatches(team, apiKey);

    const matches = [
      ...live,
      ...teamMatches.upcoming,
      ...teamMatches.results
    ];

    return res.status(200).json({
      success: true,
      source: "GOAL API",
      mode: "TEAM",
      team,
      teams,
      upcoming: teamMatches.upcoming,
      results: teamMatches.results,
      headToHead: [],
      nextMeeting: null,
      matches,
      count: matches.length
    });

  } catch (error) {
    console.error("ARASANA LIVE:", error.message);

    return res.status(error.status === 429 ? 429 : 502).json({
      success: false,
      error: error.status === 429
        ? "GOAL API istek sınırına ulaşıldı."
        : "Maç verileri alınamadı.",
      debug: {
        status: error.status || null,
        message: error.message
      }
    });
  }
}
