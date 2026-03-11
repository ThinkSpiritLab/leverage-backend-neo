# Number Auction

`Number Auction (数字拍卖)` is a 10-round sealed-bid game for Leverage OJ.

## Rules

- 3 to 5 players compete for 10 revealed number cards sampled from 1 to 20.
- Every round, all players submit a non-negative integer bid at the same time.
- The highest unique bid wins the card. If the top bid is tied, nobody wins.
- Every player starts with 100 coins.
- Bids are deducted whether the player wins or loses.
- If a bot bids above its remaining budget, that round's bid is clamped to `0`.
- Final score is the sum of card values won across all 10 rounds.

## Files

- `judge.py`: Stateful auction judge.
- `bot_proportional.py`: Python bot that scales bids with card value.
- `bot_random.py`: Python bot that bids randomly between 1 and 30.
- `bot_aggressive.py`: Python bot that pushes harder on premium cards.
- `bot.js`: JavaScript reference bot.
- `bot.cpp`: C++17 reference bot using `nlohmann/json`.
- `renderer.html`: Replay renderer with card, bids, scores, and budget bars.

## Judge notes

- The judge defaults to 4 players on round 1 because Leverage sends `{}` for initial responses.
- To run 3 or 5 players locally, set `NUMBER_AUCTION_PLAYERS=3`, `4`, or `5` before starting the judge.
- The judge finishes after processing the 10th bidding round, so the final `finish` verdict is emitted on the next judge tick.

## Bot input

Each bot receives:

```json
{
  "round": 3,
  "cardValue": 12,
  "yourBudget": 75,
  "cardsWon": [8, 4],
  "yourScore": 12,
  "roundsLeft": 7
}
```

Expected output:

```json
{"bid": 15}
```
