import json
import sys


def choose_verified_bid(your_dice, total_dice, last_bid):
    counts = {face: your_dice.count(face) for face in range(1, 7)}
    candidates = []
    for face in range(1, 7):
        for count in range(1, counts[face] + 1):
            if count > total_dice:
                continue
            if last_bid is None or count > last_bid["count"] or (
                count == last_bid["count"] and face > last_bid["face"]
            ):
                candidates.append({"count": count, "face": face})
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item["count"], item["face"]))
    return candidates[0]


while True:
    line = sys.stdin.readline()
    if not line:
        break
    state = json.loads(line)
    bid = choose_verified_bid(state["yourDice"], state["totalDice"], state.get("lastBid"))
    if bid is None and state.get("lastBid") is not None:
        move = {"action": "liar"}
    elif bid is None:
        face = max(range(1, 7), key=lambda f: state["yourDice"].count(f))
        move = {"action": "bid", "count": 1, "face": face}
    else:
        move = {"action": "bid", "count": bid["count"], "face": bid["face"]}
    print(json.dumps(move))
    sys.stdout.flush()
