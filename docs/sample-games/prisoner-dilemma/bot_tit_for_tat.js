const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on('line', (line) => {
  if (!line) return;

  const data = JSON.parse(line);
  const history = Array.isArray(data.history) ? data.history : [];
  let move = 'C';

  if (history.length > 0) {
    const lastRound = history[history.length - 1];
    const opponentId = String(data.opponent);
    const candidate = lastRound?.moves?.[opponentId];
    if (candidate === 'C' || candidate === 'D') {
      move = candidate;
    }
  }

  process.stdout.write(`${JSON.stringify({ move })}\n`);
});
