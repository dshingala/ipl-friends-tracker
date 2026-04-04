const { GROUP_A, GROUP_B } = require("./data");

function parseSlot(code) {
  const [team, rank] = code.split("-");
  return { team, rank: parseInt(rank) };
}

function calcGroup(group, topBatters) {
  return Object.entries(group).map(([member, slots]) => {
    let totalRuns = 0;
    const players = slots.map(code => {
      const { team, rank } = parseSlot(code);
      const player = (topBatters[team] || []).find(p => p.rank === rank);
      const runs = player?.runs || 0;
      totalRuns += runs;
      return { code, name: player?.name || "TBD", runs };
    });
    return { member, totalRuns, players };
  }).sort((a, b) => b.totalRuns - a.totalRuns);
}

function calculateAllScores(topBatters) {
  return {
    groupA: calcGroup(GROUP_A, topBatters),
    groupB: calcGroup(GROUP_B, topBatters),
  };
}

module.exports = { calculateAllScores };
