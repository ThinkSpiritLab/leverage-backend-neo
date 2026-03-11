import json
import os
import random
import sys


TOTAL_ROUNDS = 10
STARTING_BUDGET = 100
MIN_PLAYERS = 3
MAX_PLAYERS = 5
DEFAULT_PLAYERS = 4
CARD_MIN = 1
CARD_MAX = 20


def clamp_player_count(raw_value):
    try:
        count = int(raw_value)
    except (TypeError, ValueError):
        return DEFAULT_PLAYERS
    return max(MIN_PLAYERS, min(MAX_PLAYERS, count))


def make_initial_state():
    player_count = clamp_player_count(os.environ.get("NUMBER_AUCTION_PLAYERS"))
    cards = random.sample(range(CARD_MIN, CARD_MAX + 1), TOTAL_ROUNDS)
    player_ids = [str(index) for index in range(player_count)]
    return {
        "cards": cards,
        "playerIds": player_ids,
        "remainingBudget": {pid: STARTING_BUDGET for pid in player_ids},
        "scores": {pid: 0 for pid in player_ids},
        "cardsWon": {pid: [] for pid in player_ids},
        "history": [],
    }


def parse_bid(raw_response):
    if raw_response is None:
        return 0
    if isinstance(raw_response, dict):
        candidate = raw_response.get("bid", 0)
    elif isinstance(raw_response, str):
        stripped = raw_response.strip()
        if not stripped:
            return 0
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            candidate = stripped
        else:
            if isinstance(parsed, dict):
                candidate = parsed.get("bid", 0)
            else:
                candidate = parsed
    else:
        candidate = raw_response

    try:
        bid = int(candidate)
    except (TypeError, ValueError):
        return 0
    return max(0, bid)


def get_active_player_ids(state, responses):
    active = set(state["playerIds"])
    active.update(str(pid) for pid in responses.keys())
    ordered = sorted(active, key=lambda value: int(value))
    return ordered[:MAX_PLAYERS]


def resolve_round(state, responses, round_index):
    player_ids = get_active_player_ids(state, responses)
    state["playerIds"] = player_ids
    for pid in player_ids:
        state["remainingBudget"].setdefault(pid, STARTING_BUDGET)
        state["scores"].setdefault(pid, 0)
        state["cardsWon"].setdefault(pid, [])

    card_value = state["cards"][round_index]
    bids = {}
    debug_notes = []
    for pid in player_ids:
        bid = parse_bid(responses.get(pid))
        if bid > state["remainingBudget"][pid]:
            debug_notes.append(
                f"player {pid} overbid {bid} with {state['remainingBudget'][pid]} left; clamped to 0"
            )
            bid = 0
        state["remainingBudget"][pid] -= bid
        bids[pid] = bid

    unique_bids = {}
    for pid, bid in bids.items():
        unique_bids.setdefault(bid, []).append(pid)

    unique_positive_bids = [bid for bid, owners in unique_bids.items() if bid > 0 and len(owners) == 1]
    winner_id = None
    if unique_positive_bids:
        winning_bid = max(unique_positive_bids)
        winner_id = unique_bids[winning_bid][0]
        state["scores"][winner_id] += card_value
        state["cardsWon"][winner_id].append(card_value)
    else:
        winning_bid = None

    round_summary = {
        "round": round_index + 1,
        "cardValue": card_value,
        "bids": bids,
        "winner": winner_id,
        "winningBid": winning_bid,
        "scores": {pid: state["scores"][pid] for pid in player_ids},
        "budgets": {pid: state["remainingBudget"][pid] for pid in player_ids},
    }
    state["history"].append(round_summary)

    if winner_id is None:
        debug_notes.append(f"round {round_index + 1}: no highest unique bid")
    else:
        debug_notes.append(
            f"round {round_index + 1}: player {winner_id} won card {card_value} with bid {winning_bid}"
        )
    return "; ".join(debug_notes)


def build_display(state, next_round_index):
    player_ids = state["playerIds"]
    history = state["history"]
    return {
        "title": "Number Auction",
        "totalRounds": TOTAL_ROUNDS,
        "nextRound": next_round_index + 1 if next_round_index < TOTAL_ROUNDS else None,
        "currentCard": state["cards"][next_round_index] if next_round_index < TOTAL_ROUNDS else None,
        "players": [
            {
                "id": pid,
                "score": state["scores"][pid],
                "budget": state["remainingBudget"][pid],
                "cardsWon": state["cardsWon"][pid],
            }
            for pid in player_ids
        ],
        "history": history,
        "cardsDeck": state["cards"],
    }


def build_commands(state, round_number):
    round_index = round_number - 1
    card_value = state["cards"][round_index]
    commands = {}
    for pid in state["playerIds"]:
        commands[pid] = {
            "round": round_number,
            "cardValue": card_value,
            "yourBudget": state["remainingBudget"][pid],
            "cardsWon": state["cardsWon"][pid],
            "yourScore": state["scores"][pid],
            "roundsLeft": TOTAL_ROUNDS - round_number,
        }
    return commands


def main():
    random.seed()
    state = make_initial_state()

    while True:
        line = sys.stdin.readline()
        if not line:
            break

        payload = json.loads(line)
        round_number = int(payload.get("round", 1))
        responses = payload.get("responses", {})
        debug = ""

        if round_number > 1:
            debug = resolve_round(state, responses, round_number - 2)

        if round_number <= TOTAL_ROUNDS:
            output = {
                "commands": build_commands(state, round_number),
                "display": build_display(state, round_number - 1),
                "verdict": "continue",
                "debug": debug,
            }
        else:
            final_scores = {pid: state["scores"][pid] for pid in state["playerIds"]}
            output = {
                "commands": {},
                "display": build_display(state, TOTAL_ROUNDS),
                "verdict": "finish",
                "scores": final_scores,
                "debug": debug,
            }

        print(json.dumps(output), flush=True)


if __name__ == "__main__":
    main()
