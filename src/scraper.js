// ============================================================
//  IPL SCRAPER — GOOGLE + BACKUP SOURCES
//  Scrapes Google search for "IPL 2026 most runs" which shows
//  a live stats table — same data the admin reads manually.
//  Falls back to crictracker & espncricinfo if Google blocks.
// ============================================================

const axios   = require("axios");
const cheerio = require("cheerio");
const fs      = require("fs");
const path    = require("path");

const DB_PATH = path.join(__dirname, "../data/scores.json");

const TEAM_MAP = {
  RCB: ["royal challengers","rcb","bengaluru","bangalore"],
  KKR: ["kolkata","kkr","knight riders"],
  MI:  ["mumbai indians","mi ","mumbai"],
  CSK: ["chennai","csk","super kings"],
  GT:  ["gujarat","gt ","titans"],
  DC:  ["delhi","dc ","capitals"],
  SRH: ["sunrisers","srh","hyderabad"],
  RR:  ["rajasthan","rr ","royals"],
  PBK: ["punjab","pbk","pbks","kings xi"],
  LSG: ["lucknow","lsg","super giants"],
};

function resolveTeam(str) {
  if (!str) return null;
  const s = " " + str.toLowerCase() + " ";
  for (const [code, kws] of Object.entries(TEAM_MAP)) {
    if (kws.some(k => s.includes(k))) return code;
  }
  return null;
}

// ── Shared fetch helper ───────────────────────────────────────
async function fetch(url, ua) {
  return axios.get(url, {
    timeout: 25000,
    decompress: true,
    headers: {
      "User-Agent": ua || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      "Referer": "https://www.google.com/",
    },
  });
}

// ── Extract players from any HTML with cheerio ────────────────
function extractFromHTML(html) {
  const $ = cheerio.load(html);
  const players = [];
  const seen = new Set();

  // Strategy 1: Find tables with Player/Team/Runs columns
  $("table").each((_, table) => {
    const headers = [];
    $(table).find("th").each((_, th) => headers.push($(th).text().trim().toLowerCase()));

    const pIdx = headers.findIndex(h => /player|name|batsman/i.test(h));
    const tIdx = headers.findIndex(h => /team/i.test(h));
    const rIdx = headers.findIndex(h => /^r$|^runs$/i.test(h));

    if (rIdx === -1) return; // not a runs table

    $(table).find("tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return;

      // Use column indices if found, else try heuristically
      const name = pIdx >= 0
        ? $(cells[pIdx]).text().trim()
        : $(cells[0]).text().trim() || $(cells[1]).text().trim();

      const teamRaw = tIdx >= 0
        ? $(cells[tIdx]).text().trim()
        : $(cells[1]).text().trim() || $(cells[2]).text().trim();

      const runsRaw = rIdx >= 0
        ? $(cells[rIdx]).text().trim()
        : (() => {
            let r = "";
            cells.each((_, c) => { const t = $(c).text().trim(); if (/^\d{1,4}$/.test(t) && parseInt(t) > 0) r = r || t; });
            return r;
          })();

      const runs = parseInt(runsRaw);
      const team = resolveTeam(teamRaw) || resolveTeam(name);
      const key = name + team;

      if (name && team && !isNaN(runs) && runs > 0 && runs < 1500 && name.length > 2 && !seen.has(key)) {
        seen.add(key);
        players.push({ name: name.replace(/\s+/g, " "), team, runs });
      }
    });
  });

  // Strategy 2: Look for JSON data embedded in script tags
  if (players.length < 5) {
    $("script").each((_, s) => {
      const txt = $(s).html() || "";
      // Match arrays of player objects
      const matches = txt.matchAll(/"(?:name|player_name|batsman)"\s*:\s*"([^"]+)"[\s\S]{0,200}?"(?:runs|r)"\s*:\s*(\d+)[\s\S]{0,200}?"(?:team|team_name)"\s*:\s*"([^"]+)"/g);
      for (const m of matches) {
        const name = m[1], runs = parseInt(m[2]), team = resolveTeam(m[3]);
        const key = name + team;
        if (name && team && runs > 0 && !seen.has(key)) {
          seen.add(key);
          players.push({ name, team, runs });
        }
      }
    });
  }

  return players;
}

// ── Source 1: Google Search ───────────────────────────────────
async function scrapeGoogle() {
  // Multiple Google query variations to find the stats table
  const queries = [
    "IPL 2026 orange cap most runs batting stats",
    "IPL 2026 most runs season batting scorecard",
    "ipl 2026 batting stats most runs player team",
  ];

  for (const q of queries) {
    try {
      console.log(`[Google] Searching: "${q}"`);
      const url = `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&gl=ca&num=10`;
      const res = await fetch(url,
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      );

      const players = extractFromHTML(res.data);
      if (players.length > 5) {
        console.log(`[Google] ✅ Found ${players.length} players`);
        return players;
      }

      // Also look for a direct link to stats page in results and follow it
      const $ = cheerio.load(res.data);
      const links = [];
      $("a[href]").each((_, a) => {
        const href = $(a).attr("href") || "";
        const url2 = href.startsWith("/url?q=") ? decodeURIComponent(href.slice(7).split("&")[0]) : href;
        if (/orange.cap|most.runs|batting.stats/i.test(url2) &&
            !url2.includes("google") && url2.startsWith("http")) {
          links.push(url2);
        }
      });

      // Follow first promising link
      for (const link of links.slice(0, 3)) {
        try {
          console.log(`[Google] Following: ${link}`);
          const r2 = await fetch(link);
          const p2 = extractFromHTML(r2.data);
          if (p2.length > 5) {
            console.log(`[Google→Link] ✅ ${p2.length} players from ${link}`);
            return p2;
          }
        } catch(e2) { /* try next */ }
      }
    } catch(e) {
      console.error(`[Google] Failed (${q}):`, e.message);
    }
  }
  return null;
}

// ── Source 2: Direct cricket stats sites ─────────────────────
async function scrapeDirectSites() {
  const sites = [
    "https://www.crictracker.com/ipl-orange-cap/",
    "https://www.cricbuzz.com/cricket-series/9237/indian-premier-league-2026/stats",
    "https://stats.espncricinfo.com/ci/engine/records/batting/most_runs_career.html?id=17740;type=tournament",
  ];

  for (const url of sites) {
    try {
      console.log(`[Direct] Trying: ${url}`);
      const res = await fetch(url);
      const players = extractFromHTML(res.data);
      if (players.length > 5) {
        console.log(`[Direct] ✅ ${players.length} players from ${url}`);
        return players;
      }
    } catch(e) {
      console.error(`[Direct] ${url} failed:`, e.message);
    }
  }
  return null;
}

// ── Build team rankings ───────────────────────────────────────
function buildRankings(players) {
  const byTeam = {};
  for (const { name, team, runs } of players) {
    if (!team || !name || name.length < 3) continue;
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
  console.log(`[Rankings] ${teams.length} teams: ${teams.join(", ")}`);
  if (teams.length > 0) {
    const sample = ranked[teams[0]];
    console.log(`[Rankings] Sample: ${sample[0]?.name} (${sample[0]?.team || teams[0]}) = ${sample[0]?.runs} runs`);
  }
  return ranked;
}

// ── Never allow runs to decrease ─────────────────────────────
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
    let fixed = 0;
    for (const [team, slots] of Object.entries(newRanked)) {
      for (const slot of slots) {
        const code = `${team}-${slot.rank}`;
        if ((saved[code] || 0) > slot.runs) {
          slot.runs = saved[code];
          fixed++;
        }
      }
    }
    if (fixed > 0) console.log(`[NeverDecrease] Protected ${fixed} slots`);
  } catch(e) { /* ignore */ }
  return newRanked;
}

// ── Fallback: last saved correct data ────────────────────────
function loadBaseline() {
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (!db.groupA?.length) return null;
    console.log("[Baseline] Using last saved scores");

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
  console.log("\n[Scraper] Starting IPL 2026 fetch...");

  // Try Google first, then direct cricket sites
  let players = await scrapeGoogle();
  if (!players || players.length < 5) {
    players = await scrapeDirectSites();
  }

  if (players && players.length > 5) {
    let ranked = buildRankings(players);
    ranked = enforceNeverDecrease(ranked);
    console.log("[Scraper] ✅ Live data fetched\n");
    return ranked;
  }

  console.log("[Scraper] All sources unavailable — using saved baseline\n");
  return loadBaseline() || {};
}

module.exports = { getAllIPLData };
