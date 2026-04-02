// ============================================================
//  IPL FRIENDS TRACKER — MAIN SERVER
//  • Serves the live dashboard at http://localhost:3000
//  • Runs a cron job after each IPL match day to fetch scores
//  • Sends WhatsApp updates automatically
// ============================================================

try { require("dotenv").config({ path: require("path").join(__dirname, "../.env") }); } catch(_) {}

const express = require("express");
const cron = require("node-cron");
const path = require("path");
const { getAllIPLData } = require("./scraper");
const { calculateAllScores } = require("./calculator");
const { sendToGroup, buildWhatsAppMessage } = require("./whatsapp");
const { loadDB, updateScores } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

// ── API: get current scores ──────────────────────────────────
app.get("/api/scores", (req, res) => {
  const db = loadDB();
  res.json(db);
});

// ── API: manually trigger a score refresh ───────────────────
app.post("/api/refresh", async (req, res) => {
  console.log("[Manual] Refresh triggered via API");
  try {
    res.json({ status: "started", message: "Refreshing scores in background..." });
    await runUpdate(req.body?.gameLabel || "Manual update");
  } catch (e) {
    console.error("[Manual] Error:", e.message);
  }
});

// ── API: send WhatsApp message manually ─────────────────────
app.post("/api/send-whatsapp", async (req, res) => {
  const db = loadDB();
  if (!db.groupA?.length) {
    return res.json({ status: "error", message: "No scores loaded yet. Refresh first." });
  }
  try {
    await sendToGroup(db.groupA, db.groupB, db.lastGame || "Latest");
    res.json({ status: "sent", message: "WhatsApp message sent!" });
  } catch (e) {
    res.json({ status: "error", message: e.message });
  }
});

// ── API: preview WhatsApp message ───────────────────────────
app.get("/api/preview-message", (req, res) => {
  const db = loadDB();
  if (!db.groupA?.length) {
    return res.json({ message: "No data yet. Click Refresh first." });
  }
  const msg = buildWhatsAppMessage(db.groupA, db.groupB, db.lastGame || "Latest");
  res.json({ message: msg });
});

// ── Core update function ─────────────────────────────────────
async function runUpdate(label) {
  console.log(`\n[Update] Starting score update: ${label}`);
  try {
    const topBatters = await getAllIPLData();
    const { groupA, groupB } = calculateAllScores(topBatters);
    const gameLabel = label || `Game — ${new Date().toLocaleDateString("en-IN")}`;

    updateScores(groupA, groupB, gameLabel);
    console.log("[Update] Scores saved to DB");

    // Send WhatsApp
    if (process.env.WHATSAPP_RECIPIENTS) {
      await sendToGroup(groupA, groupB, gameLabel);
    } else {
      console.log("[Update] No WhatsApp recipients configured — skipping send");
    }

    console.log("[Update] Done!\n");
  } catch (e) {
    console.error("[Update] Error during update:", e.message);
  }
}

// ── Cron schedule: runs at 11:30 PM IST every day ────────────
// IPL matches typically end by 11 PM IST
// 11:30 PM IST = 18:00 UTC
cron.schedule("0 18 * * *", () => {
  const dateStr = new Date().toLocaleDateString("en-IN", {
    day: "numeric", month: "short"
  });
  runUpdate(`Game — ${dateStr}`);
}, { timezone: "Asia/Kolkata" });

// Also run at 3:30 PM IST for afternoon matches (if any)
cron.schedule("0 10 * * *", () => {
  const dateStr = new Date().toLocaleDateString("en-IN", {
    day: "numeric", month: "short"
  });
  runUpdate(`Afternoon game — ${dateStr}`);
}, { timezone: "Asia/Kolkata" });

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║  🏏 IPL Friends Tracker is LIVE!     ║
  ║  Dashboard: http://localhost:${PORT}    ║
  ╚══════════════════════════════════════╝
  
  Cron jobs scheduled:
  • 11:30 PM IST — after evening matches
  •  3:30 PM IST — after afternoon matches
  `);

  // Load existing DB on startup
  const db = loadDB();
  if (db.lastUpdated) {
    console.log(`[Startup] Last update: ${db.lastUpdated}`);
  } else {
    console.log("[Startup] No data yet. Visit the dashboard and click Refresh.");
  }
});

module.exports = app;
