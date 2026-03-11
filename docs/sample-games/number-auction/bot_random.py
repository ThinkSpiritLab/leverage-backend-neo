import json
import random
import sys


while True:
    line = sys.stdin.readline()
    if not line:
        break
    data = json.loads(line)
    budget = int(data.get("yourBudget", 0))
    bid = min(budget, random.randint(1, 30)) if budget > 0 else 0
    print(json.dumps({"bid": bid}))
    sys.stdout.flush()
