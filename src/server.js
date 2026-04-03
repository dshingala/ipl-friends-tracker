// ============================================================
//  IPL FRIENDS TRACKER — SERVER (Final)
// ============================================================

try { require("dotenv").config({ path: require("path").join(__dirname, "../.env") }); } catch(_) {}

const express = require("express");
const cron    = require("node-cron");
const path    = require("path");

const { getAllIPLData }       = require("./scraper");
const { calculateAllScores } = require("./calculator");
const { sendToGroup, buildWhatsAppMessage } = require("./whatsapp");
const { loadDB, saveDB, updateScores }      = require("./db");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

// ── GET /api/scores ──────────────────────────────────────────
app.get("/api/scores", (req, res) => {
  res.json(loadDB());
});

// ── GET /api/settings ────────────────────────────────────────
app.get("/api/settings", (req, res) => {
  const db = loadDB();
  res.json({
    autoSendEnabled: db.autoSendEnabled !== false,
    hasRecipients:   !!(process.env.WHATSAPP_RECIPIENTS),
    hasCricApiKey:   !!(process.env.CRICAPI_KEY),
  });
});

// ── POST /api/toggle-auto-send ────────────────────────────────
app.post("/api/toggle-auto-send", (req, res) => {
  const db = loadDB();
  db.autoSendEnabled = !(db.autoSendEnabled !== false);
  saveDB(db);
  res.json({ autoSendEnabled: db.autoSendEnabled });
});

// ── POST /api/refresh ─────────────────────────────────────────
app.post("/api/refresh", async (req, res) => {
  res.json({ status: "started" });
  const label = req.body?.gameLabel ||
    `Game — ${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"})}`;
  await runUpdate(label, false);
});

// ── POST /api/send-whatsapp ───────────────────────────────────
app.post("/api/send-whatsapp", async (req, res) => {
  const db = loadDB();
  if (!db.groupA?.length) return res.json({ status:"error", message:"No scores yet. Refresh first." });
  try {
    await sendToGroup(db.groupA, db.groupB, db.lastGame || "Latest");
    res.json({ status:"sent" });
  } catch(e) {
    res.json({ status:"error", message: e.message });
  }
});

// ── POST /api/admin-update ────────────────────────────────────
// Emergency manual override — enter totals directly
app.post("/api/admin-update", (req, res) => {
  const { gameLabel, groupA: newA, groupB: newB } = req.body || {};
  if (!newA && !newB) return res.json({ status:"error", message:"No data provided" });
  const db = loadDB();
  if (newA) {
    for (const m of db.groupA) {
      if (newA[m.member] !== undefined) m.totalRuns = parseInt(newA[m.member]);
    }
    db.groupA.sort((a,b) => b.totalRuns - a.totalRuns);
  }
  if (newB) {
    for (const m of db.groupB) {
      if (newB[m.member] !== undefined) m.totalRuns = parseInt(newB[m.member]);
    }
    db.groupB.sort((a,b) => b.totalRuns - a.totalRuns);
  }
  db.lastGame    = gameLabel || db.lastGame;
  db.lastUpdated = new Date().toISOString();
  saveDB(db);
  res.json({ status:"saved", groupA: db.groupA, groupB: db.groupB });
});

// ── Core update function ──────────────────────────────────────
async function runUpdate(label, autoSend = true) {
  console.log(`\n[Update] ${label}`);
  try {
    const topBatters      = await getAllIPLData();
    const { groupA, groupB } = calculateAllScores(topBatters);
    updateScores(groupA, groupB, label);

    const db = loadDB();
    if (autoSend && db.autoSendEnabled !== false && process.env.WHATSAPP_RECIPIENTS) {
      await sendToGroup(groupA, groupB, label);
    }
    console.log("[Update] Done\n");
  } catch(e) {
    console.error("[Update] Error:", e.message);
  }
}

// ── Cron: auto-update after every IPL match ──────────────────
// All times in IST (Asia/Kolkata) = Winnipeg CDT + 10.5 hrs
//
// Evening matches (7:30 PM IST start, ~11 PM IST end):
//   → Fetch at 11:30 PM IST = 1:00 PM CDT Winnipeg ✅
cron.schedule("30 23 * * *", () => {
  const d = new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"});
  runUpdate(`Evening match — ${d}`, true);
}, { timezone: "Asia/Kolkata" });

// Afternoon matches (3:30 PM IST start, ~7:30 PM IST end):
//   → Fetch at 8:00 PM IST = 9:30 AM CDT Winnipeg ✅
cron.schedule("0 20 * * *", () => {
  const d = new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"});
  runUpdate(`Afternoon match — ${d}`, true);
}, { timezone: "Asia/Kolkata" });

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  const db  = loadDB();
  const key = process.env.CRICAPI_KEY ? "✅ SET" : "❌ NOT SET — add at cricketdata.org";
  const wa  = process.env.WHATSAPP_RECIPIENTS ? "✅ SET" : "❌ NOT SET";
  console.log(`
╔══════════════════════════════════════════╗
║  🏏  IPL Friends Tracker is LIVE         ║
║  http://localhost:${PORT}                   ║
╠══════════════════════════════════════════╣
║  CRICAPI_KEY:          ${key.padEnd(18)}║
║  WHATSAPP_RECIPIENTS:  ${wa.padEnd(18)}║
║  Auto-send:            ${(db.autoSendEnabled!==false?"ON ✅":"OFF ❌").padEnd(18)}║
╚══════════════════════════════════════════╝
  `);
  if (!process.env.CRICAPI_KEY) {
    console.log("  ⚠️  Get your FREE API key at: https://cricketdata.org/signup.aspx");
    console.log("  Then add CRICAPI_KEY in Render → Environment settings\n");
  }
});

module.exports = app;
