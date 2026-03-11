#!/usr/bin/env python3
import json
import sys


while True:
    line = sys.stdin.readline()
    if not line:
        break
    command = json.loads(line)
    total = int(command.get("total", 0))
    move = "STAND" if total >= 15 else "HIT"
    print(json.dumps({"move": move, "strategy": "stand_at_15"}))
    sys.stdout.flush()
