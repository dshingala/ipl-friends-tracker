// ============================================================
//  IPL SCRAPER — AXIOS + CHEERIO HTML PARSING
//  
//  Strategy: fetch crictracker.com/ipl-orange-cap/ which has
//  a real HTML table (not JS-rendered) with all season runs.
//  This is the same page Google indexes for "ipl orange cap".
//
//  Falls back to stored scores if fetch fails.
// ============================================================

const axios   = require("axios");
const cheerio = require("cheerio");
const fs      = require("fs");
const path    = require("path");

const DB_PATH = path.join(__dirname, "../data/scores.json");

// Team name fragments → our short codes
const TEAM_MAP = {
  RCB: ["royal challengers","rcb","bengaluru","bangalore"],
  KKR: ["kolkata","kkr","knight riders"],
  MI:  ["mumbai","mi","indians"],
  CSK: ["chennai","csk","super kings"],
  GT:  ["gujarat","gt","titans"],
  DC:  ["delhi","dc","capitals"],
  SRH: ["sunrisers","srh","hyderabad"],
  RR:  ["rajasthan","rr","royals"],
  PBK: ["punjab","pbk","kings xi","pbks","punjab kings"],
  LSG: ["lucknow","lsg","super giants"],
};

function resolveTeam(str) {
  if (!str) return null;
  const s = str.toLowerCase();
  for (const [code, kws] of Object.entries(TEAM_MAP)) {
    if (kws.some(k => s.includes(k))) return code;
  }
  return null;
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Referer": "https://www.google.com/",
};

// ── Source 1: crictracker.com Orange Cap page ─────────────────
// Has a real server-rendered HTML table with season batting stats
async function scrapeCricTracker() {
  try {
    console.log("[Scraper] Fetching crictracker.com orange cap...");
    const res = await axios.get("https://www.crictracker.com/ipl-orange-cap/", {
      headers: HEADERS, timeout: 20000, decompress: true,
    });

    const $ = cheerio.load(res.data);
    const players = [];

    // Find the stats table — CricTracker uses a standard HTML table
    $("table").each((_, table) => {
      const headers = [];
      $(table).find("th").each((_, th) => {
        headers.push($(th).text().trim().toLowerCase());
      });

      // Check if this is the batting runs table
      if (!headers.includes("r") && !headers.includes("runs")) return;

      const playerIdx = headers.findIndex(h => h === "player" || h === "name" || h === "batsman");
      const teamIdx   = headers.findIndex(h => h === "team");
      const runsIdx   = headers.findIndex(h => h === "r" || h === "runs");

      if (runsIdx === -1) return;

      $(table).find("tr").each((_, row) => {
        const cells = $(row).find("td");
        if (!cells.length) return;

        const name = playerIdx >= 0 ? $(cells[playerIdx]).text().trim() : $(cells[1]).text().trim();
        const teamRaw = teamIdx >= 0 ? $(cells[teamIdx]).text().trim() : $(cells[2]).text().trim();
        const runs = parseInt($(cells[runsIdx]).text().trim()) || 0;

        const team = resolveTeam(teamRaw);
        if (name && team && runs > 0 && name.length > 2) {
          players.push({ name, team, runs });
        }
      });
    });

    if (players.length > 5) {
      console.log(`[Scraper] CricTracker: ${players.length} players found ✅`);
      return players;
    }

    // Table was empty (JS-rendered) — try next source
    console.log("[Scraper] CricTracker table empty (JS-rendered)");
    return null;
  } catch(e) {
    console.error("[Scraper] CricTracker failed:", e.message);
    return null;
  }
}

// ── Source 2: Google search "ipl 2026 orange cap most runs" ──
// Google's search results page shows a structured data box with
// the top run-scorers table — plain HTML, no JS required.
async function scrapeGoogleIPL() {
  try {
    console.log("[Scraper] Fetching Google IPL stats...");
    const url = "https://www.google.com/search?q=ipl+2026+orange+cap+most+runs+batting+stats&hl=en&gl=us";
    const res = await axios.get(url, {
      headers: {
        ...HEADERS,
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G975U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
      },
      timeout: 20000, decompress: true,
    });

    const $ = cheerio.load(res.data);
    const players = [];

    // Google shows a "Most Runs" knowledge card with a table
    // Look for any table with player names and numbers
    $("table, [data-ved] table, .wEaWsb table").each((_, table) => {
      $(table).find("tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 3) return;

        // Try to find: name (text), team (text with team name), runs (number)
        let name = "", teamRaw = "", runs = 0;
        cells.each((i, cell) => {
          const txt = $(cell).text().trim();
          const num = parseInt(txt);
          if (!isNaN(num) && num > 0 && num < 5000) runs = num;
          else if (resolveTeam(txt)) teamRaw = txt;
          else if (txt.length > 3 && txt.length < 40 && !/^\d/.test(txt)) name = name || txt;
        });

        const team = resolveTeam(teamRaw);
        if (name && team && runs > 0) players.push({ name, team, runs });
      });
    });

    if (players.length > 3) {
      console.log(`[Scraper] Google: ${players.length} players ✅`);
      return players;
    }
    console.log("[Scraper] Google: no structured table found");
    return null;
  } catch(e) {
    console.error("[Scraper] Google failed:", e.message);
    return null;
  }
}

// ── Source 3: ESPN Cricinfo batting records ───────────────────
async function scrapeESPN() {
  try {
    console.log("[Scraper] Fetching ESPN Cricinfo...");
    const url = "https://stats.espncricinfo.com/ci/engine/records/batting/most_runs_career.html?id=17740;type=tournament";
    const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    const $ = cheerio.load(res.data);
    const players = [];

    $("tr.data1").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 6) return;
      const name    = $(cells[0]).text().trim();
      const teamRaw = $(cells[1]).text().trim();
      const runs    = parseInt($(cells[5]).text().trim());
      const team    = resolveTeam(teamRaw);
      if (name && team && !isNaN(runs) && runs > 0) {
        players.push({ name, team, runs });
      }
    });

    if (players.length > 5) {
      console.log(`[Scraper] ESPN: ${players.length} players ✅`);
      return players;
    }
    console.log("[Scraper] ESPN: not enough rows");
    return null;
  } catch(e) {
    console.error("[Scraper] ESPN failed:", e.message);
    return null;
  }
}

// ── Build team rankings ───────────────────────────────────────
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
  const teams = Object.keys(ranked);
  console.log(`[Scraper] Rankings: ${teams.join(", ")}`);
  return ranked;
}

// ── NEVER decrease — keep max of new vs saved ─────────────────
function enforceNeverDecrease(newRanked) {
  try {
    if (!fs.existsSync(DB_PATH)) return newRanked;
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    const saved = {};
    for (const group of [db.groupA || [], db.groupB || []]) {
      for (const member of group) {
        for (const p of (member.players || [])) {
          if (p.code && p.runs !== undefined)
            saved[p.code] = Math.max(saved[p.code] || 0, p.runs);
        }
      }
    }
    for (const [team, slots] of Object.entries(newRanked)) {
      for (const slot of slots) {
        const code = `${team}-${slot.rank}`;
        if ((saved[code] || 0) > slot.runs) {
          console.log(`[NeverDecrease] ${code}: keeping ${saved[code]} not ${slot.runs}`);
          slot.runs = saved[code];
        }
      }
    }
  } catch(e) { /* ignore */ }
  return newRanked;
}

// ── Fallback: last saved data ─────────────────────────────────
function loadBaseline() {
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (!db.groupA?.length) return null;
    console.log("[Baseline] Loading last saved scores");
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
  } catch(e) { return null; }
}

// ── Main ──────────────────────────────────────────────────────
async function getAllIPLData() {
  console.log("\n[Scraper] Starting IPL 2026 data fetch...");

  // Try each source in order
  let players = null;
  players = await scrapeCricTracker();
  if (!players) players = await scrapeESPN();
  if (!players) players = await scrapeGoogleIPL();

  if (players && players.length > 5) {
    let ranked = buildRankings(players);
    ranked = enforceNeverDecrease(ranked);
    console.log("[Scraper] ✅ Live data fetched successfully\n");
    return ranked;
  }

  // All sources blocked — use saved data
  console.log("[Scraper] All sources blocked — using saved baseline\n");
  return loadBaseline() || {};
}

module.exports = { getAllIPLData };
