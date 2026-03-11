import json
import math
import random
import sys


def minimum_raise(last_bid):
    if last_bid is None:
        return {"count": 1, "face": 1}
    if last_bid["face"] < 6:
        return {"count": last_bid["count"], "face": last_bid["face"] + 1}
    return {"count": last_bid["count"] + 1, "face": 1}


while True:
    line = sys.stdin.readline()
    if not line:
        break
    state = json.loads(line)
    last_bid = state.get("lastBid")
    own_counts = {face: state["yourDice"].count(face) for face in range(1, 7)}
    expected = max(1, math.ceil(state["totalDice"] / 4))

    if last_bid and last_bid["count"] >= expected + 2 and random.random() < 0.35:
        move = {"action": "liar"}
    else:
        best_face = max(range(1, 7), key=lambda face: (own_counts[face], face))
        if last_bid is None:
            count = min(state["totalDice"], max(2, own_counts[best_face] + 1))
            face = best_face
        else:
            count = min(state["totalDice"], max(last_bid["count"], own_counts[best_face] + 2))
            face = best_face
            if count == last_bid["count"] and face <= last_bid["face"]:
                fallback = minimum_raise(last_bid)
                count, face = fallback["count"], fallback["face"]
        move = {"action": "bid", "count": count, "face": face}

    print(json.dumps(move))
    sys.stdout.flush()
