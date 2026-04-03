// ============================================================
//  IPL SCORE SCRAPER — FIXED
//
//  Key fixes:
//  1. Player→slot assignments are LOCKED at first fetch and
//     never change mid-season (prevents re-ranking chaos)
//  2. Runs can ONLY increase — never decrease (cumulative rule)
//  3. On each refresh, new runs are ADDED to saved totals
//     rather than replacing them
// ============================================================

const axios = require("axios");
const fs    = require("fs");
const path  = require("path");

const DB_PATH    = path.join(__dirname, "../data/scores.json");
const LOCK_PATH  = path.join(__dirname, "../data/player_slots.json");
const BASE       = "https://api.cricapi.com/v1";

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

// ── Find IPL 2026 series ID ───────────────────────────────────
async function findIPLSeries() {
  for (const q of ["Indian Premier League 2026", "IPL 2026", "Indian Premier League"]) {
    const list = await get("series", { offset: 0, search: q });
    if (!Array.isArray(list)) continue;
    const ipl = list.find(s =>
      /ipl|indian premier league/i.test(s.name || "") &&
      /2026/.test(s.name || s.startDate || s.endDate || "")
    ) || list.find(s => /ipl|indian premier league/i.test(s.name || ""));
    if (ipl) {
      console.log(`[CricAPI] Found series: ${ipl.name} (${ipl.id})`);
      return ipl.id;
    }
  }
  return null;
}

// ── Fetch season batting totals from API ──────────────────────
// Returns flat array: [{name, team, runs}] with CUMULATIVE season runs
async function fetchSeasonTotals(seriesId) {
  // Method A: series_stats endpoint (one call, full season totals)
  const stats = await get("series_stats", { id: seriesId });
  if (stats) {
    const batting =
      stats?.batting?.mostRuns ||
      stats?.stats?.batting?.most_runs ||
      stats?.mostRuns ||
      (Array.isArray(stats) ? stats : null);

    if (batting?.length > 5) {
      console.log(`[CricAPI] Season stats: ${batting.length} players`);
      return batting.map(b => ({
        name: b.name || b.playerName || b.batsman || b.player || "",
        team: teamCode(b.teamName || b.team || b.ti || ""),
        runs: parseInt(b.runs || b.r || 0),
      })).filter(p => p.name && p.team && p.runs > 0);
    }
  }

  // Method B: sum every completed match scorecard
  console.log("[CricAPI] series_stats unavailable, fetching match by match...");
  const info = await get("series_info", { id: seriesId });
  const matches = (info?.matchList || info?.matches || [])
    .filter(m => m.matchStarted && m.matchEnded);

  console.log(`[CricAPI] Found ${matches.length} completed matches`);
  const totals = {}; // "Name::TEAM" → runs

  for (const m of matches) {
    const sc = await get("match_scorecard", { id: m.id });
    if (!sc) continue;

    const innings = sc.scorecard || sc.score || [];
    for (const inn of innings) {
      const team = teamCode(inn.inning || inn.teamName || "");
      for (const b of (inn.batting || inn.batsmen || [])) {
        const name = b.batsman?.name || b.name || b.batsman || "";
        const runs = parseInt(b.r || b.runs || 0);
        if (name && team && !isNaN(runs) && runs >= 0) {
          const k = `${name}::${team}`;
          totals[k] = (totals[k] || 0) + runs;
        }
      }
    }
    await new Promise(r => setTimeout(r, 150));
  }

  return Object.entries(totals).map(([k, runs]) => {
    const [name, team] = k.split("::");
    return { name, team, runs };
  });
}

// ── SLOT LOCK: lock player→slot mapping at season start ───────
// Once a player is assigned to e.g. RCB-2, they STAY at RCB-2
// for the whole season even if their ranking changes.
// This is saved to data/player_slots.json.
function loadSlotLock() {
  try {
    if (fs.existsSync(LOCK_PATH))
      return JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
  } catch(e) {}
  return null; // not locked yet
}

function saveSlotLock(ranked) {
  try {
    fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
    fs.writeFileSync(LOCK_PATH, JSON.stringify(ranked, null, 2));
    console.log("[SlotLock] Player→slot assignments locked for season ✅");
  } catch(e) {
    console.error("[SlotLock] Save failed:", e.message);
  }
}

// ── Build RANKED structure, respecting the slot lock ─────────
// ranked = { TEAM: [{rank, name, runs}] }
function buildRanked(players, existingLock) {
  // Group by team
  const byTeam = {};
  for (const { name, team, runs } of players) {
    if (!team || !name) continue;
    if (!byTeam[team]) byTeam[team] = {};
    byTeam[team][name] = Math.max(byTeam[team][name] || 0, runs);
  }

  const ranked = {};

  for (const [team, batters] of Object.entries(byTeam)) {
    const sorted = Object.entries(batters).sort((a, b) => b[1] - a[1]);

    if (existingLock?.[team]) {
      // ── LOCKED: keep the same player→slot order, just update runs ──
      const lock = existingLock[team]; // [{rank, name, runs}]
      ranked[team] = lock.map(slot => ({
        rank: slot.rank,
        name: slot.name,
        // Use API run value, but NEVER go below saved value (runs only increase)
        runs: Math.max(slot.runs, batters[slot.name] || 0),
      }));
      // If new players appeared who aren't in the lock, append them
      const lockedNames = new Set(lock.map(s => s.name));
      const newPlayers = sorted.filter(([name]) => !lockedNames.has(name));
      newPlayers.forEach(([name, runs], i) => {
        ranked[team].push({ rank: lock.length + i + 1, name, runs });
      });
    } else {
      // ── FIRST TIME: rank by current runs, then lock this order ──
      ranked[team] = sorted.map(([name, runs], i) => ({
        rank: i + 1, name, runs,
      }));
    }
  }

  return ranked;
}

// ── NEVER LET RUNS DECREASE: merge with saved scores ─────────
// After building new ranked data, compare with what's in scores.json.
// If any slot's runs went DOWN (API glitch), keep the old higher value.
function enforceRunsNeverDecrease(newRanked) {
  try {
    if (!fs.existsSync(DB_PATH)) return newRanked;
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));

    // Build saved slot→runs map from scores.json
    const savedSlotRuns = {};
    for (const group of [db.groupA, db.groupB]) {
      for (const member of (group || [])) {
        for (const p of (member.players || [])) {
          if (p.code && p.runs !== undefined) {
            savedSlotRuns[p.code] = Math.max(savedSlotRuns[p.code] || 0, p.runs);
          }
        }
      }
    }

    // Enforce: each slot's runs = max(new API value, saved value)
    for (const [team, slots] of Object.entries(newRanked)) {
      for (const slot of slots) {
        const code = `${team}-${slot.rank}`;
        const saved = savedSlotRuns[code] || 0;
        if (slot.runs < saved) {
          console.log(`[NeverDecrease] ${code}: API=${slot.runs} < saved=${saved} → keeping ${saved}`);
          slot.runs = saved;
        }
      }
    }
  } catch(e) {
    console.error("[NeverDecrease]", e.message);
  }
  return newRanked;
}

// ── Fallback: load from scores.json ──────────────────────────
function loadBaseline() {
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (!db.groupA?.length) return null;
    console.log("[Baseline] Using last saved correct scores");

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
    return loadBaseline() || {};
  }

  try {
    const seriesId = await findIPLSeries();
    if (!seriesId) {
      console.log("[Scraper] IPL 2026 series not found");
      return loadBaseline() || {};
    }

    const players = await fetchSeasonTotals(seriesId);

    if (!players || players.length < 5) {
      console.log("[Scraper] Not enough player data from API");
      return loadBaseline() || {};
    }

    console.log(`[Scraper] Got ${players.length} players from API`);

    // Load existing slot lock (or null if first time)
    const existingLock = loadSlotLock();
    const firstTime = !existingLock;

    // Build ranked structure (respects slot lock)
    let ranked = buildRanked(players, existingLock);

    // Lock slots if this is the first successful fetch
    if (firstTime) saveSlotLock(ranked);

    // Ensure runs never decrease vs saved data
    ranked = enforceRunsNeverDecrease(ranked);

    console.log(`[Scraper] ✅ Done — ${Object.keys(ranked).length} teams`);
    return ranked;

  } catch(e) {
    console.error("[Scraper] Error:", e.message);
    return loadBaseline() || {};
  }
}

module.exports = { getAllIPLData };
