try { require("dotenv").config({ path: require("path").join(__dirname, "../.env") }); } catch(_) {}

const express = require("express");
const cron    = require("node-cron");
const path    = require("path");
const { getAllIPLData }    = require("./scraper");
const { calculateAllScores } = require("./calculator");
const { sendToGroup, buildWhatsAppMessage } = require("./whatsapp");
const { loadDB, saveDB }  = require("./db");

const app  = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

app.get("/api/scores",   (req, res) => res.json(loadDB()));
app.get("/api/settings", (req, res) => {
  const db = loadDB();
  res.json({ autoSendEnabled: db.autoSendEnabled !== false, hasRecipients: !!(process.env.WHATSAPP_RECIPIENTS) });
});

app.post("/api/toggle-auto-send", (req, res) => {
  const db = loadDB();
  db.autoSendEnabled = !(db.autoSendEnabled !== false);
  saveDB(db); res.json({ autoSendEnabled: db.autoSendEnabled });
});

// Auto-scrape refresh
app.post("/api/refresh", async (req, res) => {
  res.json({ status: "started" });
  await runScrapeUpdate();
});

// Manual member-total update (fallback when scraping fails)
app.post("/api/update", (req, res) => {
  const { gameLabel, members } = req.body || {};
  if (!members) return res.json({ status: "error", message: "No data" });
  const db = loadDB();
  for (const m of [...db.groupA, ...db.groupB]) {
    if (members[m.member] !== undefined)
      m.totalRuns = Math.max(m.totalRuns || 0, parseInt(members[m.member]) || 0);
  }
  db.groupA.sort((a, b) => b.totalRuns - a.totalRuns);
  db.groupB.sort((a, b) => b.totalRuns - a.totalRuns);
  db.lastGame = gameLabel || db.lastGame;
  db.lastUpdated = new Date().toISOString();
  saveDB(db);
  if (db.autoSendEnabled !== false && process.env.WHATSAPP_RECIPIENTS)
    sendToGroup(db.groupA, db.groupB, db.lastGame).catch(e => console.error(e.message));
  res.json({ status: "saved", groupA: db.groupA, groupB: db.groupB });
});

app.post("/api/send-whatsapp", async (req, res) => {
  const db = loadDB();
  if (!db.groupA?.length) return res.json({ status: "error", message: "No scores yet" });
  try { await sendToGroup(db.groupA, db.groupB, db.lastGame || "Latest"); res.json({ status: "sent" }); }
  catch(e) { res.json({ status: "error", message: e.message }); }
});

async function runScrapeUpdate() {
  console.log("\n[AutoUpdate] Starting...");
  try {
    const topBatters = await getAllIPLData();
    if (!topBatters || !Object.keys(topBatters).length) {
      console.log("[AutoUpdate] No data from scraper"); return;
    }
    const { groupA, groupB } = calculateAllScores(topBatters);
    const db = loadDB();
    db.groupA = groupA; db.groupB = groupB;
    db.lastUpdated = new Date().toISOString();
    db.lastGame = `Auto — ${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"})}`;
    saveDB(db);
    console.log("[AutoUpdate] Scores saved ✅");
    if (db.autoSendEnabled !== false && process.env.WHATSAPP_RECIPIENTS)
      await sendToGroup(groupA, groupB, db.lastGame);
  } catch(e) { console.error("[AutoUpdate]", e.message); }
}

// 11:30 PM IST after evening matches
cron.schedule("30 23 * * *", () => runScrapeUpdate(), { timezone: "Asia/Kolkata" });
// 8:00 PM IST after afternoon matches
cron.schedule("0 20 * * *", () => runScrapeUpdate(), { timezone: "Asia/Kolkata" });

app.listen(PORT, () => console.log(`\n🏏 IPL Tracker live at http://localhost:${PORT}\n`));
module.exports = app;
