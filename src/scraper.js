// ============================================================
//  IPL SCORE SCRAPER — FINAL
//
//  Source: cricketdata.org (free API, signup in 2 min)
//  Set CRICAPI_KEY in Render → fully automated forever.
//
//  Flow:
//  1. Find IPL 2026 series ID
//  2. Get season batting stats (cumulative totals per player)
//  3. If season stats not available → sum from each match scorecard
//  4. Rank players per team → calculator maps them to members
//  5. If no API key → fall back to scores.json baseline
// ============================================================

const axios = require("axios");
const fs    = require("fs");
const path  = require("path");

const DB_PATH = path.join(__dirname, "../data/scores.json");
const BASE    = "https://api.cricapi.com/v1";

const TEAM_MAP = {
  RCB: ["royal challengers","rcb","bangalore","bengaluru"],
  KKR: ["kolkata","kkr","knight riders"],
  MI:  ["mumbai","mi ","indians"],
  CSK: ["chennai","csk","super kings"],
  GT:  ["gujarat","gt ","titans"],
  DC:  ["delhi","dc ","capitals"],
  SRH: ["sunrisers","srh","hyderabad"],
  RR:  ["rajasthan","rr ","royals"],
  PBK: ["punjab","pbk","kings xi","pbks"],
  LSG: ["lucknow","lsg","super giants"],
};

function teamCode(str) {
  if (!str) return null;
  const s = str.toLowerCase();
  for (const [code, kws] of Object.entries(TEAM_MAP)) {
    if (kws.some(k => s.includes(k))) return code;
  }
  return null;
}

// ── CricketData.org API helper ────────────────────────────────
async function get(endpoint, params = {}) {
  const key = process.env.CRICAPI_KEY;
  if (!key) return null;
  try {
    const r = await axios.get(`${BASE}/${endpoint}`, {
      params: { apikey: key, ...params },
      timeout: 20000,
    });
    if (r.data?.status === "success" || r.data?.data) return r.data.data || r.data;
    return null;
  } catch(e) {
    console.error(`[CricAPI/${endpoint}]`, e.message);
    return null;
  }
}

// ── Step 1: Find IPL 2026 series ─────────────────────────────
async function findIPLSeries() {
  // Search by name
  for (const q of ["Indian Premier League 2026", "IPL 2026", "Indian Premier League"]) {
    const list = await get("series", { offset: 0, search: q });
    if (!Array.isArray(list)) continue;
    const ipl = list.find(s =>
      /ipl|indian premier league/i.test(s.name || "") &&
      /2026/.test(s.name || s.startDate || s.endDate || "")
    ) || list.find(s => /ipl|indian premier league/i.test(s.name || ""));
    if (ipl) { console.log(`[CricAPI] Series: ${ipl.name} (${ipl.id})`); return ipl.id; }
  }
  return null;
}

// ── Step 2a: Season batting stats (preferred) ─────────────────
async function getSeasonStats(seriesId) {
  const data = await get("series_stats", { id: seriesId });
  if (!data) return null;

  // Multiple possible response structures
  const batting =
    data?.batting?.mostRuns ||
    data?.stats?.batting?.most_runs ||
    data?.mostRuns ||
    (Array.isArray(data) ? data : null);

  if (!batting?.length) return null;

  const players = [];
  for (const b of batting) {
    const team = teamCode(b.teamName || b.team || b.ti || "");
    const runs  = parseInt(b.runs || b.r || 0);
    const name  = b.name || b.playerName || b.batsman || b.player || "";
    if (name && runs > 0 && team) players.push({ name, team, runs });
  }
  return players.length > 3 ? players : null;
}

// ── Step 2b: Sum from individual match scorecards ─────────────
async function getMatchByMatchStats(seriesId) {
  // Get match list
  const info = await get("series_info", { id: seriesId });
  const matches = info?.matchList || info?.matches || [];

  const totals = {}; // "Name:TEAM" → runs

  for (const m of matches) {
    if (!m.matchStarted) continue; // skip upcoming
    const sc = await get("match_scorecard", { id: m.id });
    if (!sc) continue;

    const innings = sc.scorecard || sc.score || [];
    for (const inn of innings) {
      const team = teamCode(inn.inning || inn.teamName || "");
      const batters = inn.batting || inn.batsmen || [];
      for (const b of batters) {
        const name = b.batsman?.name || b.name || b.batsman || "";
        const runs = parseInt(b.r || b.runs || 0);
        if (name && team && !isNaN(runs)) {
          const k = `${name}:${team}`;
          totals[k] = (totals[k] || 0) + runs;
        }
      }
    }
    await new Promise(r => setTimeout(r, 150)); // gentle rate-limit
  }

  return Object.entries(totals).map(([k, runs]) => {
    const [name, team] = k.split(":");
    return { name, team, runs };
  });
}

// ── Step 3: Build team rankings ───────────────────────────────
function buildRankings(players) {
  const byTeam = {};
  for (const { name, team, runs } of players) {
    if (!team || !name) continue;
    if (!byTeam[team]) byTeam[team] = {};
    byTeam[team][name] = Math.max(byTeam[team][name] || 0, runs);
  }
  const ranked = {};
  for (const [team, batters] of Object.entries(byTeam)) {
    ranked[team] = Object.entries(batters)
      .sort((a, b) => b[1] - a[1])
      .map(([name, runs], i) => ({ rank: i + 1, name, runs }));
  }
  console.log(`[CricAPI] Rankings built for: ${Object.keys(ranked).join(", ")}`);
  return ranked;
}

// ── Fallback: scores.json baseline ───────────────────────────
function loadBaseline() {
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (!db.groupA?.length) return null;
    console.log("[Baseline] Using last verified scores from scores.json");

    const slotRuns = {};
    for (const group of [db.groupA, db.groupB]) {
      for (const member of group) {
        for (const p of (member.players || [])) {
          if (p.code && p.runs !== undefined) slotRuns[p.code] = p.runs;
        }
      }
    }
    const byTeam = {};
    for (const [slot, runs] of Object.entries(slotRuns)) {
      const [team, rankStr] = slot.split("-");
      if (!byTeam[team]) byTeam[team] = [];
      byTeam[team].push({ rank: parseInt(rankStr), name: slot, runs });
    }
    const ranked = {};
    for (const [team, slots] of Object.entries(byTeam)) {
      ranked[team] = slots.sort((a, b) => a.rank - b.rank);
    }
    return ranked;
  } catch(e) {
    console.error("[Baseline]", e.message);
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────
async function getAllIPLData() {
  console.log("\n[Scraper] Fetching IPL 2026 data...");

  if (!process.env.CRICAPI_KEY) {
    console.log("[Scraper] No CRICAPI_KEY → using baseline");
    console.log("[Scraper] FREE signup: https://cricketdata.org/signup.aspx");
    return loadBaseline() || {};
  }

  try {
    const seriesId = await findIPLSeries();
    if (!seriesId) {
      console.log("[Scraper] IPL 2026 series not found yet — may not be listed");
      return loadBaseline() || {};
    }

    // Try season stats first (one API call)
    let players = await getSeasonStats(seriesId);

    // Fall back to match-by-match
    if (!players || players.length < 5) {
      console.log("[Scraper] Season stats unavailable, going match-by-match...");
      players = await getMatchByMatchStats(seriesId);
    }

    if (players && players.length > 5) {
      console.log(`[Scraper] ✅ Live data: ${players.length} players`);
      return buildRankings(players);
    }
  } catch(e) {
    console.error("[Scraper] Error:", e.message);
  }

  console.log("[Scraper] Falling back to baseline");
  return loadBaseline() || {};
}

module.exports = { getAllIPLData };
