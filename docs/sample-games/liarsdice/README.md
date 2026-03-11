# Liar's Dice (骰子游戏)

This folder contains a complete Leverage OJ game package for a simplified Liar's Dice implementation.

## Files

- `judge.py`: Runs the full game loop, validates bids, resolves liar calls, tracks lives, eliminations, and victory.
- `bot_random.py`: Random legal bidding with an approximately 20% liar-call rate.
- `bot_conservative.py`: Only makes bids justified by the bot's own dice.
- `bot_bluffer.py`: Pushes higher bids aggressively and challenges implausible claims.
- `bot.js`: Simple JavaScript bot.
- `bot.cpp`: Simple C++17 bot with lightweight fixed-shape JSON parsing.
- `renderer.html`: Replay renderer showing hidden or revealed dice, current bid, lives, and elimination history.

## Rules Implemented

- Supports 2 to 5 players.
- Each live player rolls 5 dice at the start of each hand.
- Each player starts with 3 lives.
- Bids must strictly increase by count, or by face when counts match.
- Calling `liar` reveals all dice and assigns one life loss to either the bidder or challenger.
- A player is eliminated at 0 lives.
- The next hand starts immediately after a liar resolution.
- If 8 bids occur in one hand, the next player auto-challenges.

## Judge Notes

- The judge uses `LIARSDICE_PLAYERS` to determine player count on round 1 because the protocol example does not expose player count to the judge before responses arrive.
- Default player count is `2`, which matches the playground API example with `bot0` and `bot1`.
- Commands include `canAct` and `eliminated` fields so bots can distinguish active turns from broadcast updates. The judge only reads the current player's response.

## Local Usage

Run the Python judge with Python 3:

```bash
python3 judge.py
```

Example with 4 players:

```bash
LIARSDICE_PLAYERS=4 python3 judge.py
```

## Renderer Data

The renderer expects `display` shaped like the judge output in `judge.py`, including:

- `players`: per-player dice, life, and reveal state
- `currentBid`
- `message`
- `resolution`
- `eliminationHistory`

## C++ Bot Build

The C++ bot is self-contained and targets a plain C++17 toolchain.
