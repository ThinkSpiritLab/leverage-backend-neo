# Blackjack Lite (廿一点)

Blackjack Lite is a simplified multiplayer blackjack judge for Leverage OJ. Four seats are exposed to the platform, and each player independently tries to beat the dealer without going over 21.

## Rules

- Deck: 40 cards, built from four copies each of values `1` through `10`
- Initial deal: every player gets two cards, dealer gets two cards
- Turns are sequential: only the active player receives a command in each judge round
- Valid actions: `HIT` to draw, `STAND` to stop
- Busting above 21 immediately locks that player at score `0`
- After all players finish, the dealer draws until reaching `17` or more
- Final score per player:
  - `1` if the player beats the dealer
  - `1` if the dealer busts and the player did not bust
  - `0` on tie
  - `0` on loss or bust

## Included Bots

- `bot_conservative.py`: stands at `15+`
- `bot_aggressive.py`: hits until `18+`
- `bot_basic_strategy.py`: hits below `17`, stands on `17+`
- `bot.js`: JavaScript bot that stands on `17+`
- `bot.cpp`: C++17 bot that stands on `17+`

## Strategy Notes

- Conservative bots bust less often but lose equity when the dealer lands on mid totals.
- Aggressive bots can steal more wins against strong dealer draws, but they bust noticeably more.
- The simple `17+` threshold is a solid baseline in this lite ruleset because there are no aces with alternate values and no splits or doubles.

## Judge I/O Shape

The active player receives a JSON command shaped like:

```json
{
  "playerId": 0,
  "hand": [10, 6],
  "total": 16,
  "target": 21,
  "dealerUpCard": 7,
  "deckRemaining": 30,
  "validMoves": ["HIT", "STAND"]
}
```

Bots can respond with plain text (`HIT` / `STAND`) or JSON such as:

```json
{"move": "HIT"}
```

## Renderer

`renderer.html` renders:

- all player hands and totals
- the dealer up-card while the game is ongoing
- the full dealer hand after resolution
- status badges such as `WIN`, `LOSE`, `BUST`, and `PUSH`
