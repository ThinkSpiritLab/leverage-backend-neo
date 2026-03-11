import json
import sys


while True:
    line = sys.stdin.readline()
    if not line:
        break
    data = json.loads(line)
    card_value = int(data.get("cardValue", 0))
    budget = int(data.get("yourBudget", 0))
    rounds_left = max(1, int(data.get("roundsLeft", 0)) + 1)
    target_bid = max(0, round(card_value * 1.4))
    reserve_floor = budget // rounds_left
    bid = min(budget, max(target_bid, reserve_floor))
    print(json.dumps({"bid": bid}))
    sys.stdout.flush()
