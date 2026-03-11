"""
样例裁判：井字棋（Python）

规则：3x3 格子，双方轮流，先连成线者赢
Bot 响应：{"row": 0-2, "col": 0-2}
commands[pid] = {"board": [[...]], "your_turn": bool}
"""
import sys, json

board = [[0]*3 for _ in range(3)]  # 0=空 1=玩家0 2=玩家1
current = 0
rnd = 0

def check_winner():
    b = board
    for r in range(3):
        if b[r][0] == b[r][1] == b[r][2] != 0:
            return b[r][0]
    for c in range(3):
        if b[0][c] == b[1][c] == b[2][c] != 0:
            return b[0][c]
    if b[0][0] == b[1][1] == b[2][2] != 0:
        return b[0][0]
    if b[0][2] == b[1][1] == b[2][0] != 0:
        return b[0][2]
    return 0

def is_full():
    return all(board[r][c] != 0 for r in range(3) for c in range(3))

def send(verdict, scores=None, winner=None):
    other = 1 - current
    out = {
        "commands": {
            str(current): {"board": board, "your_turn": True},
            str(other): {"board": board, "your_turn": False},
        },
        "display": {"board": board, "current_player": current, "round": rnd, "winner": winner},
        "verdict": verdict,
    }
    if scores:
        out["scores"] = scores
    print(json.dumps(out))
    sys.stdout.flush()

while True:
    rnd += 1
    send("continue")

    line = sys.stdin.readline().strip()
    data = json.loads(line)
    resp = data.get("responses", {})
    move_raw = resp.get(str(current), "{}")
    try:
        move = json.loads(move_raw) if isinstance(move_raw, str) else move_raw
        row = int(move.get("row", 0))
        col = int(move.get("col", 0))
    except Exception:
        row = col = 0

    # Find valid cell
    placed = False
    if 0 <= row < 3 and 0 <= col < 3 and board[row][col] == 0:
        board[row][col] = current + 1
        placed = True
    else:
        for r in range(3):
            for c in range(3):
                if board[r][c] == 0:
                    board[r][c] = current + 1
                    placed = True
                    break
            if placed:
                break

    winner = check_winner()
    if winner:
        w = str(winner - 1)
        l = str(1 - (winner - 1))
        send("finish", {"0": 1 if w == "0" else 0, "1": 1 if w == "1" else 0}, winner=w)
        break

    if is_full():
        send("finish", {"0": 0.5, "1": 0.5}, winner="draw")
        break

    current = 1 - current
