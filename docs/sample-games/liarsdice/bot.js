function minimumRaise(lastBid) {
  if (!lastBid) return { count: 1, face: 1 };
  if (lastBid.face < 6) return { count: lastBid.count, face: lastBid.face + 1 };
  return { count: lastBid.count + 1, face: 1 };
}

const readline = require("readline");
const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  if (!line.trim()) return;
  const state = JSON.parse(line);
  const counts = Array.from({ length: 7 }, () => 0);
  for (const die of state.yourDice) counts[die] += 1;
  const bestFace = [1, 2, 3, 4, 5, 6].sort((a, b) => counts[b] - counts[a] || b - a)[0];

  let move;
  if (state.lastBid && state.lastBid.count > counts[bestFace] + 2) {
    move = { action: "liar" };
  } else if (!state.lastBid) {
    move = { action: "bid", count: 1, face: bestFace };
  } else {
    const candidate = { count: Math.max(state.lastBid.count, counts[bestFace]), face: bestFace };
    if (candidate.count > state.lastBid.count || candidate.face > state.lastBid.face) {
      move = { action: "bid", count: candidate.count, face: candidate.face };
    } else {
      const fallback = minimumRaise(state.lastBid);
      move = { action: "bid", count: fallback.count, face: fallback.face };
    }
  }

  process.stdout.write(JSON.stringify(move) + "\n");
});
