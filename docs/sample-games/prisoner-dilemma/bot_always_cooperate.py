import json
import sys

while True:
    line = sys.stdin.readline()
    if not line:
        break
    json.loads(line)
    print(json.dumps({"move": "C"}))
    sys.stdout.flush()
