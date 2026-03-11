"""
样例裁判：猜数字对决（Python）
协议：stdin 每轮收到 JSON {"round": N, "responses": {"0": val, "1": val}}
stdout 输出 JSON {"commands": {...}, "display": {...}, "verdict": "continue"|"finish", "scores": {...}}

规则：
- 每人有 5 轮
- 每轮双方各猜一个 1-100 的数字
- 系统随机选一个答案，谁猜得更接近谁得 1 分（同距离平分）
- 5 轮结束后比较总分
"""
import sys, json, random

ROUNDS = 5
secret = random.randint(1, 100)
scores = {"0": 0, "1": 0}

for _ in range(ROUNDS):
    line = sys.stdin.readline().strip()
    data = json.loads(line)
    rnd = data["round"]
    resp = data.get("responses", {})

    try:
        g0 = int(resp.get("0", 0))
        g1 = int(resp.get("1", 0))
    except (ValueError, TypeError):
        g0 = g1 = 0

    d0 = abs(g0 - secret)
    d1 = abs(g1 - secret)

    if d0 < d1:
        scores["0"] += 1
    elif d1 < d0:
        scores["1"] += 1
    else:
        scores["0"] += 0.5
        scores["1"] += 0.5

    verdict = "finish" if rnd >= ROUNDS else "continue"
    hint = "equal" if d0 == d1 else ("bot0_closer" if d0 < d1 else "bot1_closer")

    out = {
        "commands": {
            "0": {"round": rnd, "rounds": ROUNDS, "hint": hint, "secret": secret},
            "1": {"round": rnd, "rounds": ROUNDS, "hint": hint, "secret": secret},
        },
        "display": {
            "round": rnd,
            "secret": secret,
            "guesses": {"0": g0, "1": g1},
            "distances": {"0": d0, "1": d1},
            "scores": [scores["0"], scores["1"]],
        },
        "verdict": verdict,
        "scores": scores if verdict == "finish" else None,
        "debug": f"Round {rnd}: secret={secret}, g0={g0}(d={d0}), g1={g1}(d={d1})",
    }
    if verdict != "finish":
        del out["scores"]

    print(json.dumps(out))
    sys.stdout.flush()
