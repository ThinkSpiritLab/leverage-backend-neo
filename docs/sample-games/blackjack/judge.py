#!/usr/bin/env python3
import json
import random
import sys

PLAYER_COUNT = 4
DEALER_STAND = 17
TARGET = 21


def make_deck():
    deck = [value for _ in range(4) for value in range(1, 11)]
    random.shuffle(deck)
    return deck


def hand_total(cards):
    return sum(cards)


def draw_card(state, hand):
    card = state["deck"].pop()
    hand.append(card)
    return card


def player_view(player):
    return {
        "id": player["id"],
        "hand": list(player["hand"]),
        "total": player["total"],
        "status": player["status"],
        "score": player.get("score"),
    }


def build_display(state, reveal_dealer=False):
    return {
        "title": "Blackjack Lite",
        "target": TARGET,
        "phase": state["phase"],
        "currentPlayer": state["current_player"],
        "deckRemaining": len(state["deck"]),
        "dealer": {
            "hand": list(state["dealer"]),
            "visibleHand": list(state["dealer"]) if reveal_dealer else [state["dealer"][0]],
            "total": hand_total(state["dealer"]) if reveal_dealer else state["dealer"][0],
            "hidden": not reveal_dealer,
        },
        "players": [player_view(player) for player in state["players"]],
    }


def init_state():
    deck = make_deck()
    players = []
    for pid in range(PLAYER_COUNT):
        hand = [deck.pop(), deck.pop()]
        players.append(
            {
                "id": pid,
                "hand": hand,
                "total": hand_total(hand),
                "status": "playing",
                "score": None,
            }
        )

    dealer = [deck.pop(), deck.pop()]
    return {
        "deck": deck,
        "players": players,
        "dealer": dealer,
        "current_player": 0,
        "phase": "player_turn",
    }


def parse_action(raw):
    if raw is None:
        return "STAND"
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return "STAND"
        try:
            payload = json.loads(text)
            raw = payload
        except json.JSONDecodeError:
            return text.upper()
    if isinstance(raw, dict):
        for key in ("move", "action", "command"):
            value = raw.get(key)
            if isinstance(value, str):
                return value.strip().upper()
    return "STAND"


def active_player_command(state):
    player = state["players"][state["current_player"]]
    return {
        "playerId": player["id"],
        "hand": list(player["hand"]),
        "total": player["total"],
        "target": TARGET,
        "dealerUpCard": state["dealer"][0],
        "deckRemaining": len(state["deck"]),
        "validMoves": ["HIT", "STAND"],
    }


def next_player(state):
    while state["current_player"] < PLAYER_COUNT and state["players"][state["current_player"]]["status"] != "playing":
        state["current_player"] += 1
    return state["current_player"] < PLAYER_COUNT


def finish_game(state):
    state["phase"] = "dealer_turn"
    while hand_total(state["dealer"]) < DEALER_STAND and state["deck"]:
        draw_card(state, state["dealer"])

    dealer_total = hand_total(state["dealer"])
    for player in state["players"]:
        if player["status"] == "bust":
            player["score"] = 0
            continue
        if dealer_total > TARGET:
            player["score"] = 1
            player["status"] = "win"
            continue
        if player["total"] > dealer_total:
            player["score"] = 1
            player["status"] = "win"
        elif player["total"] == dealer_total:
            player["score"] = 0
            player["status"] = "push"
        else:
            player["score"] = 0
            player["status"] = "lose"


def judge_loop():
    state = init_state()

    while True:
        line = sys.stdin.readline()
        if not line:
            break
        request = json.loads(line)
        responses = request.get("responses", {})
        debug_parts = []

        if request.get("round", 1) > 1 and state["phase"] == "player_turn" and state["current_player"] < PLAYER_COUNT:
            pid = str(state["current_player"])
            action = parse_action(responses.get(pid))
            player = state["players"][state["current_player"]]
            debug_parts.append(f"player {pid} -> {action}")

            if action == "HIT":
                card = draw_card(state, player["hand"])
                player["total"] = hand_total(player["hand"])
                debug_parts.append(f"drew {card}")
                if player["total"] > TARGET:
                    player["status"] = "bust"
                    debug_parts.append("bust")
                else:
                    debug_parts.append(f"total {player['total']}")
            else:
                player["status"] = "stand"
                debug_parts.append(f"stands on {player['total']}")

            if player["status"] != "playing":
                state["current_player"] += 1

        if state["phase"] == "player_turn" and not next_player(state):
            finish_game(state)
            scores = {str(player["id"]): player["score"] for player in state["players"]}
            reply = {
                "commands": {str(pid): None for pid in range(PLAYER_COUNT)},
                "display": build_display(state, reveal_dealer=True),
                "verdict": "finish",
                "scores": scores,
                "debug": "; ".join(debug_parts) or "game finished",
            }
        else:
            commands = {str(pid): None for pid in range(PLAYER_COUNT)}
            commands[str(state["current_player"])] = active_player_command(state)
            reply = {
                "commands": commands,
                "display": build_display(state, reveal_dealer=False),
                "verdict": "continue",
                "debug": "; ".join(debug_parts) or f"awaiting player {state['current_player']}",
            }

        print(json.dumps(reply))
        sys.stdout.flush()


if __name__ == "__main__":
    judge_loop()
