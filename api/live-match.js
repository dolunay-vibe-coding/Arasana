
const BASE_URL = "https://api.goal-api.com/v1";

const ALIASES = {
  gs: "Galatasaray",
  cimbom: "Galatasaray",
  fb: "Fenerbahçe",
  fener: "Fenerbahçe",
  bjk: "Beşiktaş",
  kartal: "Beşiktaş",
  ts: "Trabzonspor",
  amed: "Amed Sportif Faaliyetler",
  amedspor: "Amed Sportif Faaliyetler",
  erzurum: "Erzurumspor FK",
  erzurumspor: "Erzurumspor FK",
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
  "karsi", "arasindaki", "ve", "ile",
  "ne", "oldu", "mi", "mu"
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
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;

  const containers = [
    payload?.data,
    payload,
    payload?.result
  ];

  const keys = [
    "teams", "matches", "fixtures",
    "results", "upcoming", "items"
  ];

  for (const container of containers) {
    if (!container || typeof container !== "object") continue;

    for (const key of keys) {
      if (Array.isArray(container[key])) {
        return container[key];
      }
    }
  }

  return [];
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

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new Error(
      `GOAL API geçerli JSON döndürmedi. HTTP ${response.status}`
    );
  }

  if (!response.ok || payload?.success === false) {
    const error = new Error(
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      `GOAL API HTTP ${response.status}`
    );

    error.status = response.status;
    error.details = payload?.errors || payload?.details || null;

    throw error;
  }

  return payload;
}

// Kadın takımlarını normal kulüp aramasından ayırır.
function isWomenTeam(team) {
  const name = normalize(team?.name);
  const badge = normalize(team?.badge || team?.logo || "");

  return (
    name.includes("women") ||
    name.includes("womens") ||
    name.includes("kadin") ||
    name.includes("bayan") ||
    badge.includes("women") ||
    badge.includes("womens")
  );
}

function teamScore(team, tokens) {
  const name = normalize(team.name);
  let score = 0;

  for (const token of tokens) {
    if (name === token) {
      score += 10;
    } else if (name.includes(token)) {
      score += 5;
    }
  }

  return score;
}

async function findTeams(query, apiKey) {
  const tokens = getTokens(query);
  const found = new Map();
  const diagnostics = [];

  if (!tokens.length) {
    return { teams: [], diagnostics };
  }

  await Promise.all(tokens.map(async token => {
    const path = `/teams?search=${encodeURIComponent(token)}`;

    try {
      const payload = await fetchProvider(path, apiKey);
      const list = getArray(payload);

      diagnostics.push({
        endpoint: path,
        count: list.length
      });

      for (const team of list) {
        if (!team?.id || !team?.name) continue;

        // Kadın takımlarını ele.
        if (isWomenTeam(team)) continue;

        const score = teamScore(team, [token]);

        if (score <= 0) continue;

        const previous = found.get(String(team.id));

        if (!previous || score > previous.score) {
          found.set(String(team.id), {
            ...team,
            score
          });
        }
      }
    } catch (error) {
      diagnostics.push({
        endpoint: path,
        error: error.message,
        status: error.status || null
      });
    }
  }));

  const teams = [...found.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  return { teams, diagnostics };
}

function getTeamName(match, side) {
  const team = match?.[`${side}Team`] ||
    match?.[`${side}_team`];

  return (
    match?.[`${side}TeamName`] ||
    match?.[`${side}_team_name`] ||
    match?.[`match_${side}team_name`] ||
    team?.name ||
    "Bilinmeyen takım"
  );
}

function getTeamId(match, side) {
  const team = match?.[`${side}Team`] ||
    match?.[`${side}_team`];

  return (
    match?.[`${side}TeamId`] ||
    match?.[`${side}_team_id`] ||
    match?.[`match_${side}team_id`] ||
    team?.id ||
    null
  );
}

function getBadge(match, side) {
  const team = match?.[`${side}Team`] ||
    match?.[`${side}_team`];

  return (
    match?.[side === "home" ? "teamHomeBadge" : "teamAwayBadge"] ||
    match?.[side === "home" ? "team_home_badge" : "team_away_badge"] ||
    team?.badge ||
    team?.logo ||
    ""
  );
}

function normalizeMatch(match, fallback = "UNKNOWN") {
  const rawStatus = String(
    match?.matchStatus ||
    match?.match_status ||
    match?.status ||
    ""
  ).toUpperCase();

  const period = String(
    match?.matchPeriod ||
    match?.match_period ||
    match?.period ||
    ""
  ).toUpperCase();

  let type = fallback;

  if (
    rawStatus.includes("FINISHED") ||
    rawStatus === "FT" ||
    rawStatus === "AFTER_ET" ||
    rawStatus === "AFTER_PEN" ||
    period === "FINISHED"
  ) {
    type = "FINISHED";
  } else if (
    rawStatus === "LIVE" ||
    period === "FIRST_HALF" ||
    period === "SECOND_HALF" ||
    period === "EXTRA_TIME" ||
    period === "PENALTIES"
  ) {
    type = "LIVE";
  } else if (
    rawStatus.includes("SCHEDULED") ||
    rawStatus.includes("NOT_STARTED") ||
    rawStatus.includes("TIMED") ||
    rawStatus === "NS"
  ) {
    type = "UPCOMING";
  }

  const kickoffUtc =
    match?.kickoffUtc ||
    match?.kickoff_utc ||
    null;

  return {
    id: match?.id || match?.apiId || match?.match_id || "",
    homeTeam: getTeamName(match, "home"),
    awayTeam: getTeamName(match, "away"),
    homeTeamId: getTeamId(match, "home"),
    awayTeamId: getTeamId(match, "away"),

    homeScore:
      match?.homeTeamScore ??
      match?.home_team_score ??
      match?.match_hometeam_score ??
      null,

    awayScore:
      match?.awayTeamScore ??
      match?.away_team_score ??
      match?.match_awayteam_score ??
      null,

    homeBadge: getBadge(match, "home"),
    awayBadge: getBadge(match, "away"),

    league:
      match?.leagueName ||
      match?.league_name ||
      match?.league?.name ||
      "",

    country:
      match?.countryName ||
      match?.country_name ||
      "",

    status: type,
    period,

    minute:
      match?.matchMinute ??
      match?.matchElapsed ??
      match?.match_minute ??
      null,

    extra: match?.matchExtra ?? null,
    kickoffUtc,

    matchDate:
      match?.matchDate ||
      match?.match_date ||
      (kickoffUtc ? kickoffUtc.slice(0, 10) : null),

    matchTime:
      match?.matchTime ||
      match?.match_time ||
      null,

    events: Array.isArray(match?.events)
      ? match.events
      : []
  };
}

function getSeasonStart() {
  const now = new Date();
  const year = now.getUTCFullYear();

  return now.getUTCMonth() >= 6
    ? `${year}-07-01`
    : `${year - 1}-07-01`;
}

function isCurrentSeason(match) {
  const date =
    match?.matchDate ||
    match?.match_date ||
    match?.kickoffUtc?.slice(0, 10) ||
    match?.kickoff_utc?.slice(0, 10) ||
    "";

  return date >= getSeasonStart();
}

function sortMatches(matches, direction = "asc") {
  return [...matches].sort((a, b) => {
    const dateA = new Date(
      a.kickoffUtc || a.matchDate || 0
    ).getTime();

    const dateB = new Date(
      b.kickoffUtc || b.matchDate || 0
    ).getTime();

    return direction === "desc"
      ? dateB - dateA
      : dateA - dateB;
  });
}

function belongsToTeam(match, team) {
  const homeId = getTeamId(match, "home");
  const awayId = getTeamId(match, "away");

  if (homeId && awayId) {
    return (
      String(homeId) === String(team.id) ||
      String(awayId) === String(team.id)
    );
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
      (
        String(homeId) === String(team1.id) &&
        String(awayId) === String(team2.id)
      ) ||
      (
        String(homeId) === String(team2.id) &&
        String(awayId) === String(team1.id)
      )
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

async function fetchList(path, apiKey, label, diagnostics) {
  try {
    const payload = await fetchProvider(path, apiKey);
    const list = getArray(payload);

    diagnostics.push({
      name: label,
      endpoint: path,
      count: list.length,
      success: true
    });

    return list;
  } catch (error) {
    diagnostics.push({
      name: label,
      endpoint: path,
      success: false,
      status: error.status || null,
      error: error.message,
      details: error.details || null
    });

    return [];
  }
}

async function getTeamMatches(team, apiKey, diagnostics) {
  const upcomingPath =
    `/teams/${encodeURIComponent(team.id)}/upcoming`;

  const resultsPath =
    `/teams/${encodeURIComponent(team.id)}/results`;

  const [upcomingRaw, resultsRaw] = await Promise.all([
    fetchList(
      upcomingPath,
      apiKey,
      "Yaklaşan maçlar",
      diagnostics
    ),
    fetchList(
      resultsPath,
      apiKey,
      "Sezon sonuçları",
      diagnostics
    )
  ]);

  const upcoming = upcomingRaw
    .filter(match => belongsToTeam(match, team))
    .map(match => normalizeMatch(match, "UPCOMING"));

  const results = resultsRaw
    .filter(match => belongsToTeam(match, team))
    .filter(isCurrentSeason)
    .map(match => normalizeMatch(match, "FINISHED"));

  return {
    upcoming: sortMatches(upcoming, "asc").slice(0, 10),
    results: sortMatches(results, "desc").slice(0, 20)
  };
}

async function getPairMatches(team1, team2, apiKey, diagnostics) {
  const upcomingPath =
    `/teams/${encodeURIComponent(team1.id)}/upcoming`;

  const h2hPath =
    `/h2h/${encodeURIComponent(team1.id)}/${encodeURIComponent(team2.id)}/direct`;

  const [upcomingRaw, historyRaw] = await Promise.all([
    fetchList(
      upcomingPath,
      apiKey,
      "İki takımın yaklaşan maçları",
      diagnostics
    ),
    fetchList(
      h2hPath,
      apiKey,
      "İkili karşılaşmalar",
      diagnostics
    )
  ]);

  const upcoming = upcomingRaw
    .filter(match => belongsToPair(match, team1, team2))
    .map(match => normalizeMatch(match, "UPCOMING"));

  const history = historyRaw
    .filter(match => belongsToPair(match, team1, team2))
    .filter(isCurrentSeason)
    .map(match => normalizeMatch(match, "FINISHED"));

  return {
    nextMeeting: sortMatches(upcoming, "asc")[0] || null,
    headToHead: sortMatches(history, "desc").slice(0, 20)
  };
}

async function getLiveMatches(teams, apiKey, diagnostics) {
  const raw = await fetchList(
    "/fixtures/live",
    apiKey,
    "Canlı maçlar",
    diagnostics
  );

  return raw
    .filter(match =>
      teams.some(team => belongsToTeam(match, team))
    )
    .map(match => normalizeMatch(match, "LIVE"));
}

export default async function handler(req, res) {
  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

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
      error: "GOAL_API_KEY bulunamadı. Vercel ortam değişkenini kontrol et."
    });
  }

  const query = String(req.query?.q || "").trim();

  if (!query || query.length > 120) {
    return res.status(400).json({
      success: false,
      error: "Geçerli bir arama sorgusu gerekli."
    });
  }

  const diagnostics = [];

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

    const live = await getLiveMatches(
      teams,
      apiKey,
      diagnostics
    );

    if (teams.length >= 2) {
      const pair = await getPairMatches(
        teams[0],
        teams[1],
        apiKey,
        diagnostics
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

        teams: teams.map(team => ({
          id: team.id,
          name: team.name,
          badge: team.badge || team.logo || ""
        })),

        nextMeeting: pair.nextMeeting,
        upcoming: pair.nextMeeting
          ? [pair.nextMeeting]
          : [],

        results: pair.headToHead,
        headToHead: pair.headToHead,
        matches,
        count: matches.length,

        debug: {
          teamSearch: search.diagnostics,
          requests: diagnostics
        }
      });
    }

    const team = teams[0];

    const teamMatches = await getTeamMatches(
      team,
      apiKey,
      diagnostics
    );

    const matches = [
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
        badge: team.badge || team.logo || ""
      },

      teams: [{
        id: team.id,
        name: team.name,
        badge: team.badge || team.logo || ""
      }],

      upcoming: teamMatches.upcoming,
      results: teamMatches.results,
      headToHead: [],
      nextMeeting: null,
      matches,
      count: matches.length,

      debug: {
        teamSearch: search.diagnostics,
        requests: diagnostics
      }
    });

  } catch (error) {
    console.error("ARASANA LIVE MATCH:", error.message);

    return res.status(error.status === 429 ? 429 : 502).json({
      success: false,
      error: error.status === 429
        ? "GOAL API istek sınırına ulaşıldı."
        : "Maç verileri alınamadı.",

      debug: {
        status: error.status || null,
        message: error.message,
        details: error.details || null,
        requests: diagnostics
      }
    });
  }
}
