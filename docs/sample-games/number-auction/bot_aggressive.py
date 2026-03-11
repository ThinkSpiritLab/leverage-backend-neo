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

    if card_value >= 17:
        desired = 24
    elif card_value >= 13:
        desired = 18
    elif card_value >= 9:
        desired = 10
    else:
        desired = 3

    safety_cap = max(0, budget - (rounds_left - 1))
    bid = min(budget, max(0, min(desired, safety_cap)))
    print(json.dumps({"bid": bid}))
    sys.stdout.flush()
