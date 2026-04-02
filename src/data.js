// ============================================================
//  PLAYER ASSIGNMENTS — from your handwritten sheets
//  Format: "TEAM-POSITION" means that team's Nth top batter
//  e.g. "RCB-2" = RCB's 2nd highest run-scorer in the squad
// ============================================================

const GROUP_A = {
  Ravi:         ["GT-1",  "KKR-2", "PBK-5", "SRH-4", "RR-4",  "RR-5"],
  Kamlesh:      ["RCB-2", "KKR-1", "RCB-4", "RR-3",  "KKR-4", "MI-3"],
  Rohit:        ["RR-2",  "PBK-1", "PBK-3", "GT-5",  "KKR-5", "KKR-3"],
  Ashokbhai:    ["PBK-2", "DC-2",  "RCB-5", "DC-5",  "MI-5",  "SRH-3"],
  Jitukumar:    ["RR-1",  "GT-2",  "LSG-3", "LSG-4", "PBK-4", "SRH-5"],
  Jasmin:       ["SRH-2", "SRH-1", "LSG-5", "GT-4",  "CSK-3", "CSK-3"],
  Bhaveshkumar:["MI-2",  "LSG-2", "GT-3",  "DC-3",  "RCB-3", "DC-4"],
};

const GROUP_B = {
  "Viral V":      ["RCB-2", "MI-1",  "RCB-3", "PBK-5", "PBK-3", "CSK-5"],
  Dixit:          ["GT-2",  "CSK-2", "LSG-4", "MI-5",  "CSK-3", "RCB-4"],
  Jignesh:        ["RCB-1", "CSK-1", "RR-3",  "RCB-5", "GT-3",  "GT-4"],
  "Viral K":      ["SRH-2", "KKR-2", "MI-4",  "KKR-4", "GT-5",  "KKR-5"],
  Sanjaykumar:    ["PBK-2", "GT-1",  "DC-3",  "RR-4",  "RCB-4", "RR-5"],
  Vaibhav:        ["SRH-1", "RR-1",  "CSK-4", "PBK-4", "MI-3",  "DC-4"],
  Pathikkumar:    ["LSG-2", "DC-2",  "KKR-3", "SRH-4", "CSK-3", "LSG-5"],
  Kapil:          ["PBK-1", "KKR-1", "DC-5",  "SRH-3", "SRH-5", "LSG-3"],
};

// Prize structure per group
const PRIZES = {
  fund: 750,
  partyFund: 250,
  prizes: [125, 75, 50],
};

// IPL team name → official short codes used on iplt20.com
const TEAM_MAP = {
  RCB: "Royal Challengers Bengaluru",
  KKR: "Kolkata Knight Riders",
  PBK: "Punjab Kings",
  SRH: "Sunrisers Hyderabad",
  RR:  "Rajasthan Royals",
  MI:  "Mumbai Indians",
  GT:  "Gujarat Titans",
  DC:  "Delhi Capitals",
  LSG: "Lucknow Super Giants",
  CSK: "Chennai Super Kings",
};

module.exports = { GROUP_A, GROUP_B, PRIZES, TEAM_MAP };
