// ============================================================
//  WHATSAPP SENDER
//  Uses CallMeBot FREE API — no cost, no signup fees
//  Supports sending to a WhatsApp group via group invite link
// ============================================================

const axios = require("axios");
const { getPrize } = require("./calculator");

// ── Format the leaderboard message ──────────────────────────
function buildWhatsAppMessage(groupAScores, groupBScores, gameLabel) {
  const medals = ["🥇", "🥈", "🥉"];
  const prizeAmts = ["$125", "$75", "$50"];

  function formatGroup(scores, groupName) {
    let lines = [`*${groupName}*`];
    scores.forEach((s, i) => {
      const medal = medals[i] || `${i + 1}.`;
      const prize = prizeAmts[i] ? ` — ${prizeAmts[i]}` : "";
      lines.push(`${medal} ${s.member} — *${s.totalRuns} runs*${prize}`);
    });
    return lines.join("\n");
  }

  const date = new Date().toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric"
  });

  const msg = [
    `🏏 *IPL Friends Tracker*`,
    `📅 ${date} | ${gameLabel}`,
    ``,
    formatGroup(groupAScores, "Group A"),
    ``,
    formatGroup(groupBScores, "Group B"),
    ``,
    `💰 Prizes: $125 / $75 / $50 per group`,
    `🎉 Party fund: $250`,
    ``,
    `_Auto-updated after every match_ ✅`,
  ].join("\n");

  return msg;
}

// ── Send via CallMeBot (free WhatsApp API) ───────────────────
// Setup: each recipient must send "I allow callmebot to send me messages"
// to +34 644 59 86 51 on WhatsApp to get their API key
async function sendViaCallMeBot(phoneNumber, apiKey, message) {
  const encoded = encodeURIComponent(message);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${phoneNumber}&text=${encoded}&apikey=${apiKey}`;

  try {
    const res = await axios.get(url, { timeout: 15000 });
    console.log(`[WhatsApp] Sent to ${phoneNumber}:`, res.data);
    return true;
  } catch (e) {
    console.error(`[WhatsApp] Failed for ${phoneNumber}:`, e.message);
    return false;
  }
}

// ── Send to all group members listed in .env ─────────────────
async function sendToGroup(groupAScores, groupBScores, gameLabel) {
  const message = buildWhatsAppMessage(groupAScores, groupBScores, gameLabel);
  console.log("\n[WhatsApp] Message preview:\n" + message + "\n");

  // Read recipients from environment variables
  // Format in .env: WHATSAPP_RECIPIENTS=919876543210:abc123,919876543211:def456
  const recipientsEnv = process.env.WHATSAPP_RECIPIENTS || "";
  if (!recipientsEnv) {
    console.warn("[WhatsApp] No WHATSAPP_RECIPIENTS set in .env — skipping send");
    return;
  }

  const recipients = recipientsEnv.split(",").map(r => {
    const [phone, key] = r.trim().split(":");
    return { phone, key };
  });

  let sent = 0;
  for (const { phone, key } of recipients) {
    if (!phone || !key) continue;
    const ok = await sendViaCallMeBot(phone, key, message);
    if (ok) sent++;
    // Small delay between sends
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`[WhatsApp] Sent to ${sent}/${recipients.length} recipients`);
  return message;
}

module.exports = { buildWhatsAppMessage, sendToGroup };
