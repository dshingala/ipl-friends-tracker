// ============================================================
//  IMAGE GENERATOR
//  Generates an HTML page that renders exactly like the
//  Excel screenshot used for WhatsApp — Groups A & B table
//  The /api/image endpoint serves this as a PNG via html-to-image
//  (client-side canvas capture, no server dependencies needed)
// ============================================================

function buildImageHTML(groupAScores, groupBScores, gameLabel) {
  const date = new Date().toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric"
  });
  const prizes = ["$125", "$75", "$50"];
  const medals = ["🥇", "🥈", "🥉"];

  function tableRows(scores) {
    return scores.map((s, i) => {
      const bg = i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : i % 2 === 0 ? "#ffffff" : "#f0f7ff";
      const textColor = i < 3 ? "#1a1a1a" : "#1a1a1a";
      const prize = prizes[i] || "";
      return `<tr style="background:${bg}">
        <td style="padding:7px 10px;border:1px solid #bbb;font-weight:600;text-align:center;color:${textColor}">${i + 1}</td>
        <td style="padding:7px 14px;border:1px solid #bbb;font-weight:${i<3?'700':'500'};color:${textColor}">${s.member}</td>
        <td style="padding:7px 14px;border:1px solid #bbb;font-weight:700;text-align:center;color:${textColor}">${s.totalRuns}</td>
        <td style="padding:7px 10px;border:1px solid #bbb;font-weight:600;text-align:center;color:${i<3?'#1a6e2e':'#555'}">${prize}</td>
      </tr>`;
    }).join("");
  }

  function tableHeader(groupName, memberCount) {
    return `<tr style="background:#1e3a8a">
      <td colspan="4" style="padding:9px 14px;border:1px solid #bbb;color:white;font-size:15px;font-weight:700;letter-spacing:0.5px">
        ${groupName} &nbsp;<span style="font-weight:400;font-size:13px;opacity:0.85">(${memberCount} members)</span>
      </td>
    </tr>
    <tr style="background:#2d5bbc">
      <td style="padding:6px 10px;border:1px solid #bbb;color:white;font-weight:600;font-size:12px;text-align:center">Rank</td>
      <td style="padding:6px 14px;border:1px solid #bbb;color:white;font-weight:600;font-size:12px">Name</td>
      <td style="padding:6px 14px;border:1px solid #bbb;color:white;font-weight:600;font-size:12px;text-align:center">Runs</td>
      <td style="padding:6px 10px;border:1px solid #bbb;color:white;font-weight:600;font-size:12px;text-align:center">Prize</td>
    </tr>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f5f5f5; font-family: 'Segoe UI', Arial, sans-serif; padding: 0; }
  .card {
    background: white;
    width: 420px;
    padding: 0;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  }
  .top-banner {
    background: linear-gradient(135deg, #0a1628 0%, #1e3a8a 100%);
    padding: 18px 20px 14px;
    color: white;
    text-align: center;
  }
  .banner-title { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 4px; }
  .banner-sub { font-size: 13px; opacity: 0.8; margin-bottom: 2px; }
  .banner-game { font-size: 12px; opacity: 0.65; }
  .content { padding: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 14px; border-radius: 8px; overflow: hidden; }
  .prize-footer {
    background: #f0f7ff;
    border: 1px solid #c3d9f5;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 12px;
    color: #1e3a8a;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .prize-item { text-align: center; }
  .prize-item .amt { font-size: 16px; font-weight: 700; display: block; }
  .prize-item .lbl { font-size: 10px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; }
  .divider { width: 1px; background: #c3d9f5; height: 30px; }
  .footer-stamp {
    text-align: center;
    font-size: 10px;
    color: #aaa;
    padding: 8px 0 12px;
  }
</style>
</head>
<body>
<div class="card" id="capture">
  <div class="top-banner">
    <div class="banner-title">🏏 IPL Friends Tracker</div>
    <div class="banner-sub">T20 World Cup 2026</div>
    <div class="banner-game">${gameLabel} &nbsp;•&nbsp; ${date}</div>
  </div>
  <div class="content">
    <table>
      ${tableHeader("Group A", groupAScores.length)}
      ${tableRows(groupAScores)}
    </table>
    <table>
      ${tableHeader("Group B", groupBScores.length)}
      ${tableRows(groupBScores)}
    </table>
    <div class="prize-footer">
      <div class="prize-item"><span class="amt">🥇 $125</span><span class="lbl">1st Prize</span></div>
      <div class="divider"></div>
      <div class="prize-item"><span class="amt">🥈 $75</span><span class="lbl">2nd Prize</span></div>
      <div class="divider"></div>
      <div class="prize-item"><span class="amt">🥉 $50</span><span class="lbl">3rd Prize</span></div>
      <div class="divider"></div>
      <div class="prize-item"><span class="amt">🎉 $250</span><span class="lbl">Party Fund</span></div>
    </div>
  </div>
  <div class="footer-stamp">Auto-updated after every IPL match ✅</div>
</div>
</body>
</html>`;
}

module.exports = { buildImageHTML };
