"""Build 100 resistor puzzles. One blank, four choices, one exact answer.

Run: python generate.py
Writes puzzles.json beside this file.
"""
from fractions import Fraction
import json
from pathlib import Path

VOLTS = [Fraction(v) for v in (6, 12, 18, 24, 36, 48)]
OHMS = [Fraction(r) for r in (5, 10, 12, 15, 20, 24, 30, 40, 60, 80, 120)]

LEVELS = [
    (1, "One resistor", "single", 8),
    (2, "Series", "series2", 12),
    (3, "A longer series", "series3", 10),
    (4, "The blank's share", "divider", 10),
    (5, "Parallel", "parallel_total", 12),
    (6, "One branch", "parallel_branch", 10),
    (7, "Series and parallel", "mixed_total", 14),
    (8, "Voltage on the pair", "mixed_voltage", 12),
    (9, "Current in the pair", "mixed_branch", 12),
]


def ma(i):
    x = i * 1000
    if x.denominator != 1:
        return None
    n = int(x)
    if n < 20 or n > 5000:
        return None
    return n


def volts(v):
    if v.denominator != 1:
        return None
    n = int(v)
    if n < 1:
        return None
    return n


def par(a, b):
    return a * b / (a + b)


def measure(shape, v, fixed, r):
    """Return ('ma', n) or ('v', n) for blank value r. None if the reading is not a clean number."""
    if shape == "single":
        n = ma(v / r)
        return ("current", n) if n else None
    if shape == "series2":
        n = ma(v / (fixed[0] + r))
        return ("current", n) if n else None
    if shape == "series3":
        n = ma(v / (fixed[0] + fixed[1] + r))
        return ("current", n) if n else None
    if shape == "divider":
        n = volts(v * r / (fixed[0] + r))
        return ("voltage_blank", n) if n else None
    if shape == "parallel_total":
        n = ma(v / fixed[0] + v / r)
        return ("current_total", n) if n else None
    if shape == "parallel_branch":
        n = ma(v / r)
        return ("current_blank", n) if n else None
    rp = par(fixed[1], r)
    i = v / (fixed[0] + rp)
    vp = i * rp
    if shape == "mixed_total":
        n = ma(i)
        return ("current_total", n) if n else None
    if shape == "mixed_voltage":
        n = volts(vp)
        return ("voltage_pair", n) if n else None
    if shape == "mixed_branch":
        n = ma(vp / r)
        return ("current_blank", n) if n else None
    raise ValueError(shape)


def tray_for(shape, v, fixed, answer):
    hit = measure(shape, v, fixed, answer)
    if hit is None:
        return None
    wrong = []
    for r in OHMS:
        if r == answer:
            continue
        other = measure(shape, v, fixed, r)
        if other is None or other != hit:
            wrong.append(int(r))
    if len(wrong) < 3:
        return None
    # Keep the three wrong values nearest the answer, so the choice is a real one.
    wrong.sort(key=lambda r: (abs(r - int(answer)), r))
    tray = sorted([int(answer)] + wrong[:3])
    # Confirm again, including that a nearer value was not a second solution.
    winners = [r for r in tray if measure(shape, v, fixed, Fraction(r)) == hit]
    if winners != [int(answer)]:
        return None
    return tray


def candidates(shape):
    found = []
    seen = set()
    fixed_sets = [[]]
    if shape in ("series2", "divider", "parallel_total", "parallel_branch"):
        fixed_sets = [[f] for f in OHMS]
    elif shape == "series3":
        fixed_sets = [[a, b] for a in OHMS for b in OHMS]
    elif shape.startswith("mixed"):
        fixed_sets = [[s, p] for s in OHMS for p in OHMS]
    for v in VOLTS:
        for fixed in fixed_sets:
            for answer in OHMS:
                if shape != "single" and answer in fixed and shape.startswith("series"):
                    pass
                key_fixed = tuple(int(x) for x in fixed)
                # Skip a series that is the same chain written two ways.
                if shape == "series3" and key_fixed[0] > key_fixed[1]:
                    continue
                hit = measure(shape, v, fixed, answer)
                if hit is None:
                    continue
                tray = tray_for(shape, v, fixed, answer)
                if tray is None:
                    continue
                key = (shape, int(v), key_fixed, hit[0], hit[1], int(answer))
                if key in seen:
                    continue
                seen.add(key)
                found.append({
                    "shape": shape,
                    "voltage_v": int(v),
                    "fixed_ohm": [int(x) for x in fixed],
                    "target_kind": hit[0],
                    "target": hit[1],
                    "answer_ohm": int(answer),
                    "tray_ohm": tray,
                })
    found.sort(key=lambda p: (p["voltage_v"], p["target"], p["answer_ohm"], p["fixed_ohm"]))
    return found


def ease(p):
    v_rank = {12: 0, 6: 1, 24: 2, 18: 3, 36: 4, 48: 5}[p["voltage_v"]]
    round_ohm = (10, 20, 30, 60)
    nice = 0 if p["answer_ohm"] in round_ohm else 1
    awkward = sum(1 for x in p["fixed_ohm"] if x not in round_ohm)
    return (v_rank, nice, awkward, sum(p["fixed_ohm"]), p["target"], p["answer_ohm"])


def take(found, n):
    """One puzzle from each voltage in turn, then easiest first within the level."""
    buckets = {v: [] for v in (12, 6, 24, 18, 36, 48)}
    for p in found:
        buckets[p["voltage_v"]].append(p)
    picked = []
    used = set()
    while len(picked) < n:
        progressed = False
        for v in (12, 6, 24, 18, 36, 48):
            buckets[v].sort(key=ease)
            rest = []
            chosen = None
            for p in buckets[v]:
                sig = (p["voltage_v"], p["answer_ohm"], tuple(p["fixed_ohm"]), p["target"])
                if chosen is None and sig not in used:
                    chosen = p
                    used.add(sig)
                else:
                    rest.append(p)
            buckets[v] = rest
            if chosen is not None:
                picked.append(chosen)
                progressed = True
                if len(picked) == n:
                    break
        if not progressed:
            raise SystemExit(f"only {len(picked)} of {n}")
    picked.sort(key=ease)
    return picked


def main():
    puzzles = []
    summary = []
    for level, name, shape, n in LEVELS:
        batch = take(candidates(shape), n)
        summary.append((level, name, len(batch), len(candidates(shape))))
        for i, p in enumerate(batch):
            puzzles.append({
                "id": len(puzzles) + 1,
                "level": level,
                "level_name": name,
                "open": i == 0,
                **p,
            })
    if len(puzzles) != 100:
        raise SystemExit(len(puzzles))
    # Full recheck.
    for p in puzzles:
        v = Fraction(p["voltage_v"])
        fixed = [Fraction(x) for x in p["fixed_ohm"]]
        hit = measure(p["shape"], v, fixed, Fraction(p["answer_ohm"]))
        winners = [
            r for r in p["tray_ohm"]
            if measure(p["shape"], v, fixed, Fraction(r)) == hit
        ]
        if winners != [p["answer_ohm"]] or hit != (p["target_kind"], p["target"]):
            raise SystemExit(p)
    path = Path(__file__).with_name("puzzles.json")
    path.write_text(json.dumps(puzzles, indent=2), encoding="utf-8")
    open_n = sum(1 for p in puzzles if p["open"])
    print(f"wrote {path} ({len(puzzles)} puzzles, {open_n} open)")
    for p in puzzles:
        if not p["open"]:
            continue
        unit = "mA" if p["target_kind"].startswith("current") else "V"
        print(
            f"  open {p['id']} L{p['level']} {p['level_name']}: "
            f"{p['voltage_v']}V fixed={p['fixed_ohm']} {p['target_kind']} "
            f"{p['target']}{unit} answer={p['answer_ohm']} tray={p['tray_ohm']}"
        )
    for row in summary:
        print(f"  level {row[0]} {row[1]}: {row[2]} kept, {row[3]} available")


if __name__ == "__main__":
    main()
