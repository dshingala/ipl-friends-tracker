// ============================================================
//  IPL FRIENDS TRACKER — SERVER v4
//  New in this version:
//  • Auto-send toggle (enable/disable from dashboard)
//  • GitHub tarun7r/Cricket-API integration for live scores
//  • Correct scores pre-loaded from scores.json baseline
// ============================================================

try { require("dotenv").config({ path: require("path").join(__dirname, "../.env") }); } catch(_) {}

const express = require("express");
const cron    = require("node-cron");
const path    = require("path");
const axios   = require("axios");

const { getAllIPLData }       = require("./scraper");
const { calculateAllScores } = require("./calculator");
const { sendToGroup, buildWhatsAppMessage } = require("./whatsapp");
const { loadDB, updateScores, saveDB }      = require("./db");

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
    autoSendEnabled: db.autoSendEnabled !== false, // default true
    whatsappGroupLink: process.env.WHATSAPP_GROUP_LINK || "",
    hasRecipients: !!(process.env.WHATSAPP_RECIPIENTS),
  });
});

// ── POST /api/toggle-auto-send ────────────────────────────────
app.post("/api/toggle-auto-send", (req, res) => {
  const db = loadDB();
  const current = db.autoSendEnabled !== false;
  db.autoSendEnabled = !current;
  saveDB(db);
  console.log(`[AutoSend] Toggled to: ${db.autoSendEnabled}`);
  res.json({ autoSendEnabled: db.autoSendEnabled });
});

// ── POST /api/refresh ─────────────────────────────────────────
app.post("/api/refresh", async (req, res) => {
  res.json({ status: "started" });
  const label = req.body?.gameLabel ||
    `Game — ${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"})}`;
  await runUpdate(label, false); // false = don't auto-send on manual refresh
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

// ── GET /api/preview-message ──────────────────────────────────
app.get("/api/preview-message", (req, res) => {
  const db = loadDB();
  if (!db.groupA?.length) return res.json({ message:"No data yet." });
  res.json({ message: buildWhatsAppMessage(db.groupA, db.groupB, db.lastGame || "Latest") });
});

// ── POST /api/admin-update ────────────────────────────────────
// Admin manually enters member totals from Google scorecard
// Body: { gameLabel: "Game 7 — 3 Apr", groupA: {Rohit:310,...}, groupB: {...} }
app.post("/api/admin-update", (req, res) => {
  const { gameLabel, groupA: newA, groupB: newB } = req.body || {};
  if (!newA && !newB) return res.json({ status:"error", message:"No data provided" });

  const db = loadDB();

  if (newA) {
    for (const member of db.groupA) {
      if (newA[member.member] !== undefined) {
        member.totalRuns = parseInt(newA[member.member]);
      }
    }
    db.groupA.sort((a,b) => b.totalRuns - a.totalRuns);
  }
  if (newB) {
    for (const member of db.groupB) {
      if (newB[member.member] !== undefined) {
        member.totalRuns = parseInt(newB[member.member]);
      }
    }
    db.groupB.sort((a,b) => b.totalRuns - a.totalRuns);
  }

  db.lastGame = gameLabel || db.lastGame;
  db.lastUpdated = new Date().toISOString();
  saveDB(db);
  console.log(`[Admin] Manual update: ${db.lastGame}`);
  res.json({ status:"saved", lastGame: db.lastGame, groupA: db.groupA, groupB: db.groupB });
});

// ── Core update ───────────────────────────────────────────────
async function runUpdate(label, autoSend = true) {
  console.log(`\n[Update] ${label}`);
  try {
    const topBatters = await getAllIPLData();
    const { groupA, groupB } = calculateAllScores(topBatters);
    updateScores(groupA, groupB, label);
    console.log("[Update] Scores saved");

    const db = loadDB();
    const shouldSend = autoSend && db.autoSendEnabled !== false && process.env.WHATSAPP_RECIPIENTS;
    if (shouldSend) {
      console.log("[Update] Sending WhatsApp update...");
      await sendToGroup(groupA, groupB, label);
    } else if (autoSend) {
      console.log("[Update] Auto-send skipped (disabled or no recipients configured)");
    }
    console.log("[Update] Done\n");
  } catch(e) {
    console.error("[Update] Error:", e.message);
  }
}

// ── Cron: 11:30 PM IST (18:00 UTC) — after evening matches ───
cron.schedule("0 18 * * *", () => {
  const d = new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"});
  runUpdate(`Game — ${d}`, true);
}, { timezone: "Asia/Kolkata" });

// ── Cron: 3:30 PM IST (10:00 UTC) — afternoon double-headers ─
cron.schedule("0 10 * * *", () => {
  const d = new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"});
  runUpdate(`Afternoon — ${d}`, true);
}, { timezone: "Asia/Kolkata" });

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  const db = loadDB();
  const autoState = db.autoSendEnabled !== false ? "ON ✅" : "OFF ❌";
  console.log(`
╔══════════════════════════════════════════╗
║  🏏  IPL Friends Tracker — LIVE          ║
║  http://localhost:${PORT}                   ║
╠══════════════════════════════════════════╣
║  Cron: 11:30 PM IST  (evening games)     ║
║  Cron:  3:30 PM IST  (afternoon games)   ║
║  Auto WhatsApp send: ${autoState.padEnd(20)}║
╚══════════════════════════════════════════╝`);
});

module.exports = app;
