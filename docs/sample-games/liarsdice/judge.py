import json
import os
import random
import sys


MAX_BIDS_PER_HAND = 8
STARTING_DICE = 5
STARTING_LIVES = 3


def clamp_players(value):
    try:
        count = int(value)
    except (TypeError, ValueError):
        count = 2
    return max(2, min(5, count))


PLAYER_COUNT = clamp_players(os.environ.get("LIARSDICE_PLAYERS", "2"))


def flush_output(payload):
    print(json.dumps(payload), flush=True)


def active_players(state):
    return [pid for pid in state["playerIds"] if state["lives"][pid] > 0]


def total_dice(state):
    return sum(len(state["dice"].get(pid, [])) for pid in active_players(state))


def next_active_pid(state, start_pid):
    players = active_players(state)
    if not players:
        return None
    idx = players.index(start_pid) if start_pid in players else 0
    return players[(idx + 1) % len(players)]


def legal_raise(last_bid, count, face):
    if not isinstance(count, int) or not isinstance(face, int):
        return False
    if count < 1 or face < 1 or face > 6:
        return False
    if last_bid is None:
        return True
    return count > last_bid["count"] or (
        count == last_bid["count"] and face > last_bid["face"]
    )


def minimum_raise(last_bid):
    if last_bid is None:
        return {"count": 1, "face": 1}
    if last_bid["face"] < 6:
        return {"count": last_bid["count"], "face": last_bid["face"] + 1}
    return {"count": last_bid["count"] + 1, "face": 1}


def count_face(state, face):
    return sum(1 for pid in active_players(state) for die in state["dice"][pid] if die == face)


def build_player_state(state, pid):
    return {
        "id": pid,
        "lives": state["lives"][pid],
        "diceCount": len(state["dice"].get(pid, [])),
        "dice": state["dice"].get(pid, []),
        "eliminated": state["lives"][pid] <= 0,
    }


def build_display(state, message, reveal=False, resolution=None):
    return {
        "title": "Liar's Dice",
        "hand": state["handNumber"],
        "turnPlayer": state["currentTurn"],
        "currentBid": state["lastBid"],
        "bidsThisHand": state["bidsThisHand"],
        "maxBidsPerHand": MAX_BIDS_PER_HAND,
        "message": message,
        "revealDice": reveal,
        "resolution": resolution,
        "players": [
            {
                "id": pid,
                "lives": state["lives"][pid],
                "revealed": reveal,
                "dice": state["dice"].get(pid, []),
                "diceCount": len(state["dice"].get(pid, [])),
                "eliminated": state["lives"][pid] <= 0,
            }
            for pid in state["playerIds"]
        ],
        "eliminationHistory": state["eliminationHistory"],
    }


def build_command(state, pid):
    live_players = active_players(state)
    return {
        "yourDice": state["dice"].get(pid, []),
        "totalDice": total_dice(state),
        "lastBid": None if state["lastBid"] is None else {
            "count": state["lastBid"]["count"],
            "face": state["lastBid"]["face"],
        },
        "lastBidder": None if state["lastBid"] is None else state["lastBid"]["bidder"],
        "yourLives": state["lives"][pid],
        "livesSnapshot": {player_id: state["lives"][player_id] for player_id in state["playerIds"]},
        "round": state["handNumber"],
        "canAct": pid == state["currentTurn"] and pid in live_players,
        "eliminated": state["lives"][pid] <= 0,
        "maxBidsPerHand": MAX_BIDS_PER_HAND,
        "bidsThisHand": state["bidsThisHand"],
    }


def build_commands(state):
    return {pid: build_command(state, pid) for pid in state["playerIds"]}


def roll_hand(state, starter_pid):
    for pid in state["playerIds"]:
        if state["lives"][pid] > 0:
            state["dice"][pid] = [random.randint(1, 6) for _ in range(STARTING_DICE)]
        else:
            state["dice"][pid] = []
    state["lastBid"] = None
    state["bidsThisHand"] = 0
    state["handNumber"] += 1
    state["currentTurn"] = starter_pid if starter_pid in active_players(state) else active_players(state)[0]


def init_state():
    player_ids = [str(i) for i in range(PLAYER_COUNT)]
    state = {
        "playerIds": player_ids,
        "lives": {pid: STARTING_LIVES for pid in player_ids},
        "dice": {pid: [] for pid in player_ids},
        "currentTurn": player_ids[0],
        "lastBid": None,
        "bidsThisHand": 0,
        "handNumber": 0,
        "eliminationHistory": [],
    }
    roll_hand(state, player_ids[0])
    return state


def normalize_action(raw, state, pid):
    notes = []
    if not isinstance(raw, dict):
        notes.append(f"Player {pid} sent non-object response; using fallback.")
        raw = {}

    action = raw.get("action")
    if action == "liar" and state["lastBid"] is not None:
        return {"action": "liar"}, notes

    if action == "bid":
        count = raw.get("count")
        face = raw.get("face")
        if legal_raise(state["lastBid"], count, face):
            return {"action": "bid", "count": count, "face": face}, notes
        notes.append(f"Player {pid} sent invalid bid; using minimum legal raise.")
    elif action == "liar" and state["lastBid"] is None:
        notes.append(f"Player {pid} called liar without a prior bid; using minimum legal raise.")
    else:
        notes.append(f"Player {pid} sent invalid action; using fallback.")

    fallback = minimum_raise(state["lastBid"])
    return {"action": "bid", "count": fallback["count"], "face": fallback["face"]}, notes


def resolve_liar(state, challenger_pid, auto=False):
    bid = state["lastBid"]
    actual = count_face(state, bid["face"])
    bid_true = actual >= bid["count"]
    loser = challenger_pid if bid_true else bid["bidder"]
    state["lives"][loser] -= 1

    eliminated = None
    if state["lives"][loser] <= 0:
        eliminated = loser
        state["eliminationHistory"].append(
            {"hand": state["handNumber"], "player": loser, "reason": "lost all lives"}
        )

    survivors = active_players(state)
    winner = survivors[0] if len(survivors) == 1 else None
    resolution = {
        "type": "liar_call",
        "challenger": challenger_pid,
        "bidder": bid["bidder"],
        "bid": {"count": bid["count"], "face": bid["face"]},
        "actualCount": actual,
        "bidTrue": bid_true,
        "loser": loser,
        "eliminated": eliminated,
        "autoChallenge": auto,
        "winner": winner,
    }
    return resolution


def finish_payload(state, message, resolution, display_state=None):
    winner = active_players(state)[0]
    scores = {pid: (1 if pid == winner else 0) for pid in state["playerIds"]}
    return {
        "commands": build_commands(state),
        "display": build_display(display_state or state, message, reveal=True, resolution=resolution),
        "verdict": "finish",
        "scores": scores,
        "debug": message,
    }


def continue_payload(
    state, message, reveal=False, resolution=None, debug_notes=None, display_state=None
):
    notes = debug_notes or []
    debug = message if not notes else f"{message} | {' '.join(notes)}"
    return {
        "commands": build_commands(state),
        "display": build_display(
            display_state or state, message, reveal=reveal, resolution=resolution
        ),
        "verdict": "continue",
        "debug": debug,
    }


def main():
    random.seed()
    state = None

    while True:
        line = sys.stdin.readline()
        if not line:
            break

        try:
            incoming = json.loads(line)
        except json.JSONDecodeError:
            if state is None:
                state = init_state()
            flush_output(continue_payload(state, "Invalid judge input; waiting for next round."))
            continue

        if state is None or incoming.get("round") == 1:
            state = init_state()
            flush_output(
                continue_payload(
                    state,
                    f"Hand {state['handNumber']} begins. Player {state['currentTurn']} to act.",
                )
            )
            continue

        live_players = active_players(state)
        if len(live_players) <= 1:
            resolution = {"winner": live_players[0]} if live_players else None
            flush_output(finish_payload(state, f"Player {live_players[0]} wins.", resolution))
            continue

        actor = state["currentTurn"]
        raw_response = incoming.get("responses", {}).get(actor)
        if isinstance(raw_response, str):
            try:
                raw_response = json.loads(raw_response)
            except json.JSONDecodeError:
                raw_response = {}

        action, notes = normalize_action(raw_response, state, actor)

        if action["action"] == "liar":
            revealed_state = json.loads(json.dumps(state))
            resolution = resolve_liar(state, actor)
            if resolution["winner"] is not None:
                flush_output(
                    finish_payload(
                        state,
                        f"Player {resolution['winner']} wins.",
                        resolution,
                        display_state=revealed_state,
                    )
                )
                continue

            starter = resolution["loser"]
            if state["lives"].get(starter, 0) <= 0:
                starter = next_active_pid(state, starter)
            roll_hand(state, starter)
            flush_output(
                continue_payload(
                    state,
                    f"Player {actor} called liar. Player {resolution['loser']} lost a life.",
                    reveal=True,
                    resolution=resolution,
                    debug_notes=notes,
                    display_state=revealed_state,
                )
            )
            continue

        state["lastBid"] = {"count": action["count"], "face": action["face"], "bidder": actor}
        state["bidsThisHand"] += 1

        if state["bidsThisHand"] >= MAX_BIDS_PER_HAND:
            challenger = next_active_pid(state, actor)
            revealed_state = json.loads(json.dumps(state))
            resolution = resolve_liar(state, challenger, auto=True)
            if resolution["winner"] is not None:
                flush_output(
                    finish_payload(
                        state,
                        f"Auto-challenge resolved. Player {resolution['winner']} wins.",
                        resolution,
                        display_state=revealed_state,
                    )
                )
                continue

            starter = resolution["loser"]
            if state["lives"].get(starter, 0) <= 0:
                starter = next_active_pid(state, starter)
            roll_hand(state, starter)
            flush_output(
                continue_payload(
                    state,
                    f"Bid limit reached. Player {challenger} auto-challenged and player {resolution['loser']} lost a life.",
                    reveal=True,
                    resolution=resolution,
                    debug_notes=notes,
                    display_state=revealed_state,
                )
            )
            continue

        state["currentTurn"] = next_active_pid(state, actor)
        flush_output(
            continue_payload(
                state,
                f"Player {actor} bid {action['count']} x face {action['face']}. Player {state['currentTurn']} to act.",
                debug_notes=notes,
            )
        )


if __name__ == "__main__":
    main()
