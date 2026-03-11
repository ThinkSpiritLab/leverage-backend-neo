import json
import sys

while True:
    line = sys.stdin.readline()
    if not line:
        break

    data = json.loads(line)
    history = data.get("history", [])
    if not history:
        move = "C"
    else:
        last_round = history[-1]
        move = last_round.get("moves", {}).get(str(data.get("opponent", 1)), "C")
        if move not in {"C", "D"}:
            move = "C"

    print(json.dumps({"move": move}))
    sys.stdout.flush()
