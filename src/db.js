// ============================================================
//  SIMPLE FILE DATABASE
//  Saves scores to a JSON file so they persist between restarts
//  No database needed — free and simple
// ============================================================

const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "../data/scores.json");

// Ensure data directory exists
function ensureDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadDB() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) {
    return {
      lastUpdated: null,
      lastGame: "Season start",
      groupA: [],
      groupB: [],
      history: [],
    };
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(data) {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function updateScores(groupAScores, groupBScores, gameLabel) {
  const db = loadDB();
  const snapshot = {
    timestamp: new Date().toISOString(),
    label: gameLabel,
    groupA: groupAScores,
    groupB: groupBScores,
  };
  db.lastUpdated = snapshot.timestamp;
  db.lastGame = gameLabel;
  db.groupA = groupAScores;
  db.groupB = groupBScores;
  db.history = [snapshot, ...(db.history || [])].slice(0, 30); // keep last 30
  saveDB(db);
  return db;
}

module.exports = { loadDB, saveDB, updateScores };
