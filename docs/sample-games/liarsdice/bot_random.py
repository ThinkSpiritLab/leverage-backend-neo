import json
import random
import sys


def minimum_raise(last_bid):
    if last_bid is None:
        return {"count": 1, "face": 1}
    if last_bid["face"] < 6:
        return {"count": last_bid["count"], "face": last_bid["face"] + 1}
    return {"count": last_bid["count"] + 1, "face": 1}


def all_legal_bids(total_dice, last_bid):
    bids = []
    for count in range(1, total_dice + 1):
        for face in range(1, 7):
            if last_bid is None or count > last_bid["count"] or (
                count == last_bid["count"] and face > last_bid["face"]
            ):
                bids.append({"count": count, "face": face})
    return bids


while True:
    line = sys.stdin.readline()
    if not line:
        break
    state = json.loads(line)
    bids = all_legal_bids(state["totalDice"], state.get("lastBid"))

    if state.get("lastBid") and random.random() < 0.2:
        move = {"action": "liar"}
    elif bids:
        choice = random.choice(bids[: min(len(bids), 18)])
        move = {"action": "bid", "count": choice["count"], "face": choice["face"]}
    else:
        fallback = minimum_raise(state.get("lastBid"))
        move = {"action": "bid", "count": fallback["count"], "face": fallback["face"]}

    print(json.dumps(move))
    sys.stdout.flush()
