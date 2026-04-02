// ============================================================
//  SCORE CALCULATOR
//  Maps IPL player rankings → group member totals
// ============================================================

const { GROUP_A, GROUP_B, PRIZES } = require("./data");

// Parse assignment like "RCB-2" → { team: "RCB", rank: 2 }
function parseAssignment(code) {
  const [team, rank] = code.split("-");
  return { team, rank: parseInt(rank) };
}

// Given topBatters map and a group, calculate each member's total runs
function calcGroupScores(group, topBatters) {
  const scores = [];

  for (const [member, assignments] of Object.entries(group)) {
    let totalRuns = 0;
    const playerDetails = [];

    for (const code of assignments) {
      const { team, rank } = parseAssignment(code);
      const teamBatters = topBatters[team] || [];
      const player = teamBatters.find(p => p.rank === rank);

      if (player) {
        totalRuns += player.runs;
        playerDetails.push({ code, name: player.name, runs: player.runs });
      } else {
        playerDetails.push({ code, name: "TBD", runs: 0 });
      }
    }

    scores.push({ member, totalRuns, players: playerDetails });
  }

  // Sort by runs descending
  return scores.sort((a, b) => b.totalRuns - a.totalRuns);
}

// Calculate prize for rank (1-indexed)
function getPrize(rank) {
  return PRIZES.prizes[rank - 1] || null;
}

// Full calculation for both groups
function calculateAllScores(topBatters) {
  const groupA = calcGroupScores(GROUP_A, topBatters);
  const groupB = calcGroupScores(GROUP_B, topBatters);
  return { groupA, groupB };
}

module.exports = { calculateAllScores, getPrize };
