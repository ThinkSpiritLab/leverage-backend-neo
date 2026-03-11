import json
import sys


TOTAL_ROUNDS = 15
VALID_MOVES = {"C", "D"}
PAYOFFS = {
    ("C", "C"): (3, 3),
    ("C", "D"): (0, 5),
    ("D", "C"): (5, 0),
    ("D", "D"): (1, 1),
}


def normalize_move(raw_move):
    if isinstance(raw_move, str):
        move = raw_move.strip().upper()
    elif isinstance(raw_move, dict):
        value = raw_move.get("move")
        move = value.strip().upper() if isinstance(value, str) else ""
    else:
        move = ""
    return move if move in VALID_MOVES else "D"


def emit(payload):
    print(json.dumps(payload))
    sys.stdout.flush()


def build_command(player_id, opponent_id, round_number, scores, history):
    return {
        "round": round_number,
        "totalRounds": TOTAL_ROUNDS,
        "you": player_id,
        "opponent": opponent_id,
        "scores": {
            "self": scores[player_id],
            "opponent": scores[opponent_id],
        },
        "history": history,
    }


def main():
    scores = {"0": 0, "1": 0}
    history = []

    while True:
        line = sys.stdin.readline()
        if not line:
            break

        state = json.loads(line)
        round_number = state.get("round", 1)
        responses = state.get("responses", {})

        if round_number == 1:
            emit(
                {
                    "commands": {
                        "0": build_command("0", "1", round_number, scores, history),
                        "1": build_command("1", "0", round_number, scores, history),
                    },
                    "display": {
                        "title": "Iterated Prisoner's Dilemma",
                        "round": 0,
                        "totalRounds": TOTAL_ROUNDS,
                        "history": history,
                        "scores": scores,
                    },
                    "verdict": "continue",
                    "debug": "Initial game state sent.",
                }
            )
            continue

        move0 = normalize_move(responses.get("0"))
        move1 = normalize_move(responses.get("1"))
        payoff0, payoff1 = PAYOFFS[(move0, move1)]
        scores["0"] += payoff0
        scores["1"] += payoff1

        history.append(
            {
                "round": round_number - 1,
                "moves": {"0": move0, "1": move1},
                "payoff": {"0": payoff0, "1": payoff1},
                "cumulative": {"0": scores["0"], "1": scores["1"]},
            }
        )

        verdict = "finish" if len(history) >= TOTAL_ROUNDS else "continue"
        payload = {
            "commands": {
                "0": build_command("0", "1", round_number, scores, history),
                "1": build_command("1", "0", round_number, scores, history),
            },
            "display": {
                "title": "Iterated Prisoner's Dilemma",
                "round": len(history),
                "totalRounds": TOTAL_ROUNDS,
                "history": history,
                "scores": scores,
                "lastRound": history[-1],
            },
            "verdict": verdict,
            "debug": f"Round {round_number - 1}: P0={move0}, P1={move1}",
        }

        if verdict == "finish":
            payload["scores"] = scores

        emit(payload)


if __name__ == "__main__":
    main()
