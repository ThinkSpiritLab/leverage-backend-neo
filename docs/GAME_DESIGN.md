# Leverage MCP — AI Game Design Guide

You are an AI game designer using the Leverage platform via MCP tools.

## Your workflow

1. **Understand the game** — Read the rules carefully before writing any code
2. **Write the judge** — The judge controls the game flow
3. **Write test bots** — Simple bots to verify the judge works
4. **Test** — Use `test_judge` to run a match and check the result
5. **Iterate** — Fix bugs until `verdict=finish` and scores are correct
6. **Submit judge** — Use `submit_judge` to publish the judge to the game (admin token required)
7. **Submit renderer** — Use `submit_renderer` to publish the HTML visualizer (admin token required)
8. **Submit bots** — Use `submit_bot` to add bots to the leaderboard

## Judge protocol

The judge is a long-running process. Each round:
- **stdin**: `{"round": N, "responses": {"0": "<bot0_output>", "1": "<bot1_output>"}}`
- **stdout**: JSON object:

```json
{
  "commands": {"0": <data_for_bot0>, "1": <data_for_bot1>},
  "display": <any_display_data>,
  "verdict": "continue" | "finish",
  "scores": {"0": 1, "1": 0},
  "debug": "optional debug string"
}
```

- Only include `scores` when `verdict == "finish"`
- `commands` values are what each bot receives as input next round
- On the first round, `responses` will be empty `{}` — send initial `commands` to both bots

## Bot protocol

Each round the bot receives the judge's `commands[pid]` as stdin JSON, outputs its move as stdout.

Simple bot (outputs JSON move):

```python
import sys, json

while True:
    line = sys.stdin.readline()
    if not line:
        break
    data = json.loads(line)
    # ... compute move based on data ...
    print(json.dumps({"move": my_move}))
    sys.stdout.flush()
```

Or just output the move directly (if judge accepts plain text):

```python
import sys

while True:
    line = sys.stdin.readline()
    if not line:
        break
    # parse and respond
    print(42)
    sys.stdout.flush()
```

## Testing with test_judge

Call `test_judge` with your judge code and two simple bot codes.
Check the returned `rounds` to verify:

- Each round has correct `display`
- `verdict` becomes `finish` at the right time
- `finalResult` (scores) are correct

Example call:

```
test_judge(
  gameId=1,
  judgerCode="...",
  judgerLanguage="python",
  bot0Code="import sys,json\nwhile True:\n  d=json.loads(sys.stdin.readline())\n  print(0)\n  sys.stdout.flush()",
  bot0Language="python",
  bot1Code="...",
  bot1Language="python"
)
```

## Common mistakes

- Forgetting `sys.stdout.flush()` after each print → TLE / deadlock
- Not handling the first round where `responses` is `{}` — still must output `commands`
- Including `scores` in non-finish rounds — ignored but wasteful
- Bot not reading stdin before printing → deadlock
- Judge exiting too early without emitting `verdict=finish`
- Judge infinite loop (no termination condition) → timeout

## Supported languages

| Name           | language value |
|----------------|---------------|
| Python 3       | `python` or `python3` |
| C++17          | `cpp17`       |
| Java           | `java`        |
| JavaScript (Node) | `javascript` |

## Example: Nim game

### Game rules
- Start with N stones
- Each turn, a player removes 1, 2, or 3 stones
- Player who takes the last stone wins

### Judge (Python)

```python
import sys, json

INITIAL_STONES = 21
stones = INITIAL_STONES
current_player = 0

for round_num in range(1, 200):
    data = json.loads(sys.stdin.readline())
    responses = data.get("responses", {})

    if round_num > 1:
        move = int(responses.get(str(current_player), "1"))
        move = max(1, min(3, move))  # clamp to valid range
        stones -= move
        if stones <= 0:
            # current_player wins
            scores = {"0": 1, "1": 0} if current_player == 0 else {"0": 0, "1": 1}
            print(json.dumps({
                "commands": {"0": None, "1": None},
                "display": {"stones": 0, "winner": current_player},
                "verdict": "finish",
                "scores": scores,
            }))
            sys.stdout.flush()
            break
        current_player = 1 - current_player

    print(json.dumps({
        "commands": {"0": {"stones": stones, "pid": 0}, "1": {"stones": stones, "pid": 1}},
        "display": {"stones": stones, "turn": current_player},
        "verdict": "continue",
    }))
    sys.stdout.flush()
```

### Bot (Python, greedy)

```python
import sys, json

while True:
    line = sys.stdin.readline()
    if not line:
        break
    data = json.loads(line)
    stones = data.get("stones", 1)
    # Winning strategy: leave opponent a multiple of 4
    move = stones % 4
    if move == 0:
        move = 1  # forced bad move
    print(move)
    sys.stdout.flush()
```

## Renderer protocol

The renderer is a standalone HTML page running in a sandboxed iframe. It receives game state via `window.postMessage`.

### Message types

```js
// Replay mode: full game log with round index
window.addEventListener('message', (e) => {
  if (e.data.type === 'gameLog') {
    const { gameLog, round } = e.data;
    // gameLog.rounds[round].judgeCmd.display — display data for this round
    // gameLog.rounds[round].botResponses      — {"0": move0, "1": move1}
    // gameLog.finalResult                     — {"0": score0, "1": score1}
  }
  // Human turn: current game state from bot's perspective
  if (e.data.type === 'gameState') {
    const { gameState, playerIndex } = e.data;
    // gameState.requests[last] — latest judge request (JSON string)
    // playerIndex — which player the human is
  }
});
```

### Minimal renderer template

```html
<!DOCTYPE html>
<html>
<body>
<div id="app">Waiting…</div>
<script>
window.addEventListener('message', e => {
  if (e.data.type !== 'gameLog') return;
  const { gameLog, round } = e.data;
  const r = gameLog.rounds[round] || gameLog.rounds[gameLog.rounds.length - 1];
  const display = r?.judgeCmd?.display || {};
  document.getElementById('app').innerHTML =
    '<pre>' + JSON.stringify(display, null, 2) + '</pre>';
});
</script>
</body>
</html>
```

Use `submit_renderer` to upload the final HTML. Test first in Playground → 渲染器 tab.
