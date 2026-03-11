const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", (line) => {
  const command = JSON.parse(line);
  const total = Number(command.total || 0);
  const move = total >= 17 ? "STAND" : "HIT";
  process.stdout.write(JSON.stringify({ move, strategy: "js_stand_at_17" }) + "\n");
});
