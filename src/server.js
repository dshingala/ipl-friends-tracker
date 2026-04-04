// ============================================================
//  IPL FRIENDS TRACKER — SIMPLE & RELIABLE SERVER
//  No scraping, no APIs, no limits.
//  One person enters the 15 totals → app does everything else.
// ============================================================

try { require("dotenv").config({ path: require("path").join(__dirname, "../.env") }); } catch(_) {}

const express = require("express");
const cron    = require("node-cron");
const path    = require("path");
const { sendToGroup, buildWhatsAppMessage } = require("./whatsapp");
const { loadDB, saveDB } = require("./db");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

// ── GET /api/scores ─────────────────────────────────────────
app.get("/api/scores", (req, res) => res.json(loadDB()));

// ── GET /api/settings ────────────────────────────────────────
app.get("/api/settings", (req, res) => {
  const db = loadDB();
  res.json({
    autoSendEnabled: db.autoSendEnabled !== false,
    hasRecipients:   !!(process.env.WHATSAPP_RECIPIENTS),
  });
});

// ── POST /api/toggle-auto-send ───────────────────────────────
app.post("/api/toggle-auto-send", (req, res) => {
  const db = loadDB();
  db.autoSendEnabled = !(db.autoSendEnabled !== false);
  saveDB(db);
  res.json({ autoSendEnabled: db.autoSendEnabled });
});

// ── POST /api/update ─────────────────────────────────────────
// Main endpoint: someone enters the 15 member totals from Google
// Body: { gameLabel: "Game 7", members: { Rohit: 310, Kamlesh: 275, ... } }
app.post("/api/update", (req, res) => {
  const { gameLabel, members } = req.body || {};
  if (!members || Object.keys(members).length === 0) {
    return res.json({ status: "error", message: "No data provided" });
  }

  const db = loadDB();

  // Update Group A
  for (const m of db.groupA) {
    if (members[m.member] !== undefined) {
      const newRuns = parseInt(members[m.member]) || 0;
      // NEVER DECREASE — season runs only go up
      m.totalRuns = Math.max(m.totalRuns || 0, newRuns);
    }
  }
  db.groupA.sort((a, b) => b.totalRuns - a.totalRuns);

  // Update Group B
  for (const m of db.groupB) {
    if (members[m.member] !== undefined) {
      const newRuns = parseInt(members[m.member]) || 0;
      m.totalRuns = Math.max(m.totalRuns || 0, newRuns);
    }
  }
  db.groupB.sort((a, b) => b.totalRuns - a.totalRuns);

  db.lastGame    = gameLabel || db.lastGame;
  db.lastUpdated = new Date().toISOString();
  saveDB(db);

  console.log(`[Update] Saved: ${db.lastGame}`);

  // Auto-send WhatsApp if enabled
  if (db.autoSendEnabled !== false && process.env.WHATSAPP_RECIPIENTS) {
    sendToGroup(db.groupA, db.groupB, db.lastGame)
      .then(() => console.log("[WhatsApp] Sent"))
      .catch(e  => console.error("[WhatsApp]", e.message));
  }

  res.json({ status: "saved", groupA: db.groupA, groupB: db.groupB });
});

// ── POST /api/send-whatsapp ──────────────────────────────────
app.post("/api/send-whatsapp", async (req, res) => {
  const db = loadDB();
  if (!db.groupA?.length) return res.json({ status: "error", message: "No scores yet" });
  try {
    await sendToGroup(db.groupA, db.groupB, db.lastGame || "Latest");
    res.json({ status: "sent" });
  } catch(e) {
    res.json({ status: "error", message: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🏏 IPL Friends Tracker running at http://localhost:${PORT}\n`);
});

module.exports = app;
