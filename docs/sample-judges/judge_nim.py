"""
样例裁判：Nim 取石子（Python）

规则：
- 初始有 N 堆石子，每堆数量随机
- 双方轮流，当前玩家选一堆取走 1~该堆全部石子
- 取走最后一块石子的人 获胜（标准 Nim）
- 格式：commands[pid] = {"piles": [...], "your_turn": true/false}
- Bot 响应：{"pile": idx, "take": n}
"""
import sys, json, random

INITIAL_PILES = [random.randint(1, 7) for _ in range(3)]
piles = list(INITIAL_PILES)
current = 0  # 0 or 1
rnd = 0
scores = {"0": 0, "1": 0}

def send(verdict, extra_display=None):
    other = 1 - current
    display = {"piles": piles, "current_player": current, "round": rnd}
    if extra_display:
        display.update(extra_display)
    out = {
        "commands": {
            str(current): {"piles": piles, "your_turn": True},
            str(other): {"piles": piles, "your_turn": False},
        },
        "display": display,
        "verdict": verdict,
    }
    if verdict == "finish":
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
        pile_idx = int(move.get("pile", 0))
        take = int(move.get("take", 1))
    except Exception:
        pile_idx, take = 0, 1

    # Validate and apply
    if 0 <= pile_idx < len(piles) and 1 <= take <= piles[pile_idx]:
        piles[pile_idx] -= take
    else:
        # Invalid move — take 1 from first non-empty pile
        for i, p in enumerate(piles):
            if p > 0:
                piles[i] -= 1
                pile_idx, take = i, 1
                break

    if all(p == 0 for p in piles):
        scores[str(current)] = 1
        send("finish")
        break

    current = 1 - current
