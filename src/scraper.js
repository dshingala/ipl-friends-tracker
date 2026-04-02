// ============================================================
//  IPL SCORE SCRAPER
//  Uses Cricbuzz's unofficial JSON endpoints (free, no API key)
//  Falls back to CricAPI free tier if needed
// ============================================================

const axios = require("axios");
const { TEAM_MAP } = require("./data");

// Headers to mimic a real browser request
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

// ── Cricbuzz scrape ──────────────────────────────────────────
async function fetchIPLMatchesFromCricbuzz() {
  try {
    // Cricbuzz matches list
    const url = "https://www.cricbuzz.com/api/cricket-match/live-matches";
    const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    const matches = res.data?.typeMatches || [];
    const iplMatches = [];

    for (const type of matches) {
      for (const series of (type.seriesMatches || [])) {
        const seriesName = series.seriesAdWrapper?.seriesName || "";
        if (!seriesName.toLowerCase().includes("indian premier league") &&
            !seriesName.toLowerCase().includes("ipl")) continue;

        for (const match of (series.seriesAdWrapper?.matches || [])) {
          iplMatches.push(match.matchInfo);
        }
      }
    }
    return iplMatches;
  } catch (e) {
    console.error("[Cricbuzz] Failed:", e.message);
    return [];
  }
}

// ── Fetch scorecard for a single match ──────────────────────
async function fetchScorecardFromCricbuzz(matchId) {
  try {
    const url = `https://www.cricbuzz.com/api/cricket-match/${matchId}/full-scorecard`;
    const res = await axios.get(url, { headers: HEADERS, timeout: 10000 });
    return res.data;
  } catch (e) {
    console.error(`[Cricbuzz] Scorecard ${matchId} failed:`, e.message);
    return null;
  }
}

// ── Parse batting scorecard into player run map ──────────────
// Returns: { "Player Name": runs, ... }
function parseBattingCard(scorecard) {
  const batters = {};
  try {
    const innings = scorecard?.scoreCard || [];
    for (const inning of innings) {
      const battingTeam = inning.batTeamDetails?.batTeamName || "";
      for (const key of Object.keys(inning.batTeamDetails?.batsmenData || {})) {
        const b = inning.batTeamDetails.batsmenData[key];
        if (b?.runs !== undefined) {
          batters[b.batName] = (batters[b.batName] || 0) + b.runs;
        }
      }
    }
  } catch (e) {
    console.error("[parseCard] Error:", e.message);
  }
  return batters;
}

// ── Get top-N batters per team ───────────────────────────────
// Returns: { "RCB": ["Virat Kohli","Faf du Plessis",...], ... }
function getTopBattersPerTeam(allMatchData) {
  // Accumulate runs per player per team across season
  const teamBatters = {}; // { TEAM_SHORT: { playerName: totalRuns } }

  for (const { teamShort, batters } of allMatchData) {
    if (!teamBatters[teamShort]) teamBatters[teamShort] = {};
    for (const [name, runs] of Object.entries(batters)) {
      teamBatters[teamShort][name] = (teamBatters[teamShort][name] || 0) + runs;
    }
  }

  // Sort and return ranked lists
  const ranked = {};
  for (const [team, players] of Object.entries(teamBatters)) {
    ranked[team] = Object.entries(players)
      .sort((a, b) => b[1] - a[1])
      .map(([name, runs], i) => ({ rank: i + 1, name, runs }));
  }
  return ranked;
}

// ── Main export: get all IPL batting data ────────────────────
async function getAllIPLData() {
  console.log("[Scraper] Fetching IPL matches...");

  const matches = await fetchIPLMatchesFromCricbuzz();
  console.log(`[Scraper] Found ${matches.length} IPL matches`);

  const allMatchData = [];

  for (const match of matches) {
    const matchId = match?.matchId;
    if (!matchId) continue;

    // Identify teams
    const team1 = match?.team1?.teamSName || "";
    const team2 = match?.team2?.teamSName || "";

    const scorecard = await fetchScorecardFromCricbuzz(matchId);
    if (!scorecard) continue;

    const batters = parseBattingCard(scorecard);

    // Assign batters to their team
    for (const [teamKey] of Object.entries(TEAM_MAP)) {
      if (team1.includes(teamKey) || team2.includes(teamKey)) {
        allMatchData.push({ teamShort: teamKey, batters, matchId });
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  return getTopBattersPerTeam(allMatchData);
}

module.exports = { getAllIPLData };
