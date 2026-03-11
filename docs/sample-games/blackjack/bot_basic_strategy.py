#!/usr/bin/env python3
import json
import sys


while True:
    line = sys.stdin.readline()
    if not line:
        break
    command = json.loads(line)
    total = int(command.get("total", 0))
    move = "HIT" if total < 17 else "STAND"
    print(json.dumps({"move": move, "strategy": "hit_below_17"}))
    sys.stdout.flush()
