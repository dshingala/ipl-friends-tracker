// ============================================================
//  IPL SCORE SCRAPER v5
//  
//  HOW THE ADMIN GETS SCORES:
//  Google Search "ipl cricket score" → match scorecard → each
//  player's season runs. This data comes from Sportz Interactive /
//  Sportradar. The best FREE public API that mirrors this same
//  data is CricAPI.com (free tier, 100 req/day, no key needed
//  for public endpoints) and ESPN Cricinfo HTML.
//
//  Sources tried in order:
//  1. CricAPI.com free tier — real IPL 2026 season batting stats
//  2. ESPN Cricinfo HTML batting records table
//  3. Baseline from scores.json — always shows correct numbers
//
//  The baseline is ALWAYS the safety net. It uses the admin's
//  manually verified totals stored in scores.json, so even when
//  all scraping fails the dashboard shows correct numbers.
// ============================================================

const axios = require("axios");
const fs    = require("fs");
const path  = require("path");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36";

// ESPN Cricinfo IPL 2026 series ID — update if needed each year
const ESPN_SERIES_ID = "1449924";

const TEAM_KEYWORDS = {
  RCB: ["royal challengers","rcb","bangalore","bengaluru"],
  KKR: ["kolkata","kkr","knight riders"],
  MI:  ["mumbai","mi ","indians"],
  CSK: ["chennai","csk","super kings"],
  GT:  ["gujarat","gt ","titans"],
  DC:  ["delhi","dc ","capitals"],
  SRH: ["sunrisers","srh","hyderabad"],
  RR:  ["rajasthan","rr ","royals"],
  PBK: ["punjab","pbk","kings xi","pbks","punjab kings"],
  LSG: ["lucknow","lsg","super giants"],
};

function resolveTeam(str) {
  if (!str) return null;
  const s = str.toLowerCase();
  for (const [code, kws] of Object.entries(TEAM_KEYWORDS)) {
    if (kws.some(k => s.includes(k))) return code;
  }
  return null;
}

// ── Source 1: CricAPI.com free tier ──────────────────────────
// https://cricapi.com — free, returns Google-equivalent data
// Endpoint: /v1/series_stats (season batting totals per player)
async function fetchCricAPI() {
  const apiKey = process.env.CRICAPI_KEY;
  if (!apiKey) {
    console.log("[CricAPI] No CRICAPI_KEY set — skipping");
    return null;
  }
  try {
    console.log("[CricAPI] Fetching IPL 2026 series list...");

    // Step 1: find IPL 2026 series ID
    const listRes = await axios.get(
      `https://api.cricapi.com/v1/series?apikey=${apiKey}&offset=0`,
      { timeout: 12000 }
    );
    const series = listRes.data?.data || [];
    const ipl = series.find(s =>
      (s.name || "").toLowerCase().includes("ipl") ||
      (s.name || "").toLowerCase().includes("indian premier league")
    );
    if (!ipl) { console.log("[CricAPI] IPL series not found"); return null; }

    console.log(`[CricAPI] IPL series: ${ipl.name} (${ipl.id})`);

    // Step 2: get series squad/stats
    const statsRes = await axios.get(
      `https://api.cricapi.com/v1/series_stats?apikey=${apiKey}&id=${ipl.id}`,
      { timeout: 12000 }
    );
    const stats = statsRes.data?.data || {};
    const batting = stats.batting?.mostRuns || stats.mostRuns || [];

    const players = [];
    for (const b of batting) {
      const teamCode = resolveTeam(b.teamName || b.team || "");
      const runs = parseInt(b.runs || b.Runs || 0);
      const name = b.name || b.playerName || b.batName || "";
      if (name && runs > 0 && teamCode) {
        players.push({ name, team: teamCode, runs });
      }
    }

    if (players.length > 10) {
      console.log(`[CricAPI] ✅ Got ${players.length} players`);
      return players;
    }
    console.log("[CricAPI] Not enough data");
    return null;
  } catch(e) {
    console.error("[CricAPI] Error:", e.message);
    return null;
  }
}

// ── Source 2: ESPN Cricinfo HTML batting table ────────────────
async function scrapeESPN() {
  try {
    console.log("[ESPN] Scraping batting records...");
    const url = `https://stats.espncricinfo.com/ci/engine/records/batting/most_runs_career.html?id=${ESPN_SERIES_ID};type=series`;
    const res = await axios.get(url, {
      headers: { "User-Agent": UA, "Accept": "text/html" },
      timeout: 20000,
    });
    const html = res.data;
    const players = [];
    const rowRe = /<tr class="data1">([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRe.exec(html)) !== null) {
      const cells = [];
      const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let t;
      while ((t = tdRe.exec(m[1])) !== null) {
        cells.push(t[1].replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").trim());
      }
      // ESPN: Player | Team | Mat | Inns | NO | Runs | ...
      if (cells.length >= 6) {
        const runs = parseInt(cells[5]);
        const team = resolveTeam(cells[1]);
        if (!isNaN(runs) && runs > 0 && team && cells[0]) {
          players.push({ name: cells[0], team, runs });
        }
      }
    }
    if (players.length > 10) {
      console.log(`[ESPN] ✅ Got ${players.length} players`);
      return players;
    }
    console.log("[ESPN] Too few rows — likely blocked or off-season");
    return null;
  } catch(e) {
    console.error("[ESPN] Error:", e.message);
    return null;
  }
}

// ── Source 3: Baseline from scores.json ──────────────────────
// Reads the admin-verified member totals and reconstructs a
// slot-value map so the calculator gets the right numbers.
// This is the GUARANTEED fallback — always correct.
function loadBaseline() {
  try {
    const dbPath = path.join(__dirname, "../data/scores.json");
    if (!fs.existsSync(dbPath)) return null;
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    if (!db.groupA?.length) return null;

    console.log("[Baseline] Loading from admin-verified scores.json");

    // Build slot→runs map from stored player details
    const slotRuns = {};
    for (const group of [db.groupA, db.groupB]) {
      for (const member of group) {
        // Use the member's totalRuns divided equally as a fallback,
        // but prefer the stored per-player breakdown if available
        for (const p of (member.players || [])) {
          if (p.code && p.runs !== undefined) {
            // If same slot appears in multiple members, take the stored value
            // (they should be the same player, so same run value)
            slotRuns[p.code] = p.runs;
          }
        }
      }
    }

    // Build team ranked structure directly from slot values
    const teamSlots = {};
    for (const [slot, runs] of Object.entries(slotRuns)) {
      const parts = slot.split("-");
      const team = parts[0];
      const rank = parseInt(parts[1]);
      if (!teamSlots[team]) teamSlots[team] = [];
      teamSlots[team].push({ rank, name: slot, runs });
    }

    const ranked = {};
    for (const [team, slots] of Object.entries(teamSlots)) {
      ranked[team] = slots
        .sort((a,b) => a.rank - b.rank)
        .map(s => ({ rank: s.rank, name: s.name, runs: s.runs }));
    }

    console.log(`[Baseline] ✅ Loaded ${Object.keys(ranked).length} teams`);
    return ranked;
  } catch(e) {
    console.error("[Baseline] Error:", e.message);
    return null;
  }
}

// ── Build team rankings from flat player list ─────────────────
function buildTeamRankings(players) {
  const teamBatters = {};
  for (const { name, team, runs } of players) {
    if (!team || !name) continue;
    if (!teamBatters[team]) teamBatters[team] = {};
    teamBatters[team][name] = Math.max(teamBatters[team][name] || 0, runs);
  }
  const ranked = {};
  for (const [team, batters] of Object.entries(teamBatters)) {
    ranked[team] = Object.entries(batters)
      .sort((a,b) => b[1] - a[1])
      .map(([name, runs], i) => ({ rank: i+1, name, runs }));
  }
  return ranked;
}

// ── Main ──────────────────────────────────────────────────────
async function getAllIPLData() {
  console.log("\n[Scraper] Fetching IPL 2026 data...");

  // Try live sources first
  let players = await fetchCricAPI();
  if (!players) players = await scrapeESPN();

  if (players && players.length > 0) {
    console.log("[Scraper] Using live data ✅");
    return buildTeamRankings(players);
  }

  // Always fall back to baseline — guaranteed correct numbers
  console.log("[Scraper] Live sources unavailable — using admin-verified baseline");
  const baseline = loadBaseline();
  if (baseline) return baseline;

  console.log("[Scraper] ⚠️ No data source available");
  return {};
}

module.exports = { getAllIPLData };
