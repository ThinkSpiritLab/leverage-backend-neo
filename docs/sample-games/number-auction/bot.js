const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", (line) => {
  if (!line) {
    return;
  }

  const data = JSON.parse(line);
  const cardValue = Number(data.cardValue || 0);
  const budget = Number(data.yourBudget || 0);
  const roundsLeft = Number(data.roundsLeft || 0) + 1;

  let bid = Math.ceil(cardValue * 1.1);
  if (cardValue >= 15) {
    bid += 4;
  }
  const pacingCap = Math.max(0, budget - (roundsLeft - 1) * 2);
  bid = Math.max(0, Math.min(budget, Math.min(bid, pacingCap)));

  process.stdout.write(`${JSON.stringify({ bid })}\n`);
});
