"""The ten tracks, and how each becomes what the game drives on.

A track is drawn as corners joined by straights (``fillet``: each corner a circular arc of a
given radius, the way tracks are sketched) or as a smooth curve through points (``spline``,
centripetal Catmull-Rom). From that, :func:`build` makes everything the game and the AI use,
written once to ``apexline/data/tracks/<id>.json`` (``python -m apexline.trackgen``):

- the centre line every 2 m (``x``, ``y``, ``z``; y is up, metres), and the grip under each point;
- the racing line: how far left of the centre a car should be at each point (``line``), found by
  pulling a band tight inside the road, which gives the outside-inside-outside line through a
  corner;
- the corners along the racing line, in race order: direction, angle, tightest radius, grip, the
  straight before it, and the fastest speed the car can take it at (``limit_kmh``: the radius
  times the car's grip, as the game's physics has it);
- where the road crosses itself (``open``: no walls there; the figure eight).

Left is ``+``: a positive offset or curvature is to the left of the way the track runs.
"""

from __future__ import annotations

import dataclasses
import json
import math
from pathlib import Path

DS = 2.0  # metres between points
SHOULDER = 3.0  # grass or sand between the road's edge and the wall
DATA = Path(__file__).resolve().parent / "data" / "tracks"

# The car, the same for both drivers (assets/apexline/physics.js reads these from the track).
CAR = {
    "vmax": round(200 / 3.6, 3),  # m/s
    "accel": 9.0,  # m/s² from standstill, falling to 0 at vmax
    "brake": 10.0,  # m/s² times the grip
    "lat": 10.0,  # the most sideways acceleration, m/s² times the grip
    "wheelbase": 2.6,
    "length": 4.4,
    "width": 1.9,
}


@dataclasses.dataclass
class Design:
    id: str
    name: dict[str, str]
    blurb: dict[str, str]
    theme: str
    stars: int  # how hard, 1 to 5
    laps: int
    width: float
    grip: float  # the road's grip (1.0: dry asphalt)
    kind: str  # fillet or spline
    points: list[tuple[float, ...]]  # fillet: (x, z, radius, y); spline: (x, z, y)
    zones: list[tuple[float, float, float, str]] = dataclasses.field(default_factory=list)  # (from, to) as parts of a lap, grip, kind


DESIGNS: list[Design] = [
    Design(
        "sunny_oval",
        {"zh": "陽光環道", "en": "Sunny Oval"},
        {"zh": "兩條長直線、兩個大彎，熟悉車子的第一站。", "en": "Two long straights and two wide turns: get to know the car."},
        "sunny", 1, 3, 18, 1.0, "fillet",
        [(-260, -110, 100, 0), (260, -110, 100, 0), (260, 110, 100, 0), (-260, 110, 100, 0)],
    ),
    Design(
        "coast",
        {"zh": "海岸彎道", "en": "Coastal Esses"},
        {"zh": "沿著海邊的長直線，接一連串左右交錯的 S 彎。", "en": "A long run by the sea into a string of left-right esses."},
        "coast", 2, 2, 14, 1.0, "fillet",
        [(-400, 170, 70, 0), (380, 170, 55, 0), (430, 20, 45, 2), (300, -40, 35, 3), (180, 40, 35, 2), (60, -50, 35, 3), (-60, 30, 35, 2), (-180, -60, 45, 3), (-430, -40, 70, 1)],
    ),
    Design(
        "hairpin_pass",
        {"zh": "髮夾山路", "en": "Hairpin Pass"},
        {"zh": "一路爬坡、連續三個髮夾彎，再一路衝下山。", "en": "Climb through three hairpins, then race back down the mountain."},
        "mountain", 4, 2, 12, 1.0, "fillet",
        [(260, 200, 25, 6), (260, 150, 25, 10), (-150, 150, 20, 22), (-150, 110, 20, 26), (200, 110, 18, 38), (200, 74, 18, 42), (-60, 74, 50, 46), (-200, 20, 60, 40), (-420, 40, 70, 20), (-440, 200, 45, 4)],
    ),
    Design(
        "figure_eight",
        {"zh": "八字交叉", "en": "Figure Eight"},
        {"zh": "8 字形賽道，中間的十字路口兩車會交會，小心相撞。", "en": "An eight whose middle is a crossroads: mind the other car there."},
        "stadium", 3, 3, 14, 1.0, "fillet",
        [(-300, -160, 90, 0), (300, 160, 90, 0), (300, -160, 90, 0), (-300, 160, 90, 0)],
    ),
    Design(
        "city",
        {"zh": "城市街道", "en": "City Blocks"},
        {"zh": "大樓之間的直角彎和一個小 S 彎，煞車點很重要。", "en": "Right-angle turns between the towers and a quick chicane: brake on time."},
        "city", 3, 3, 12, 1.0, "fillet",
        [(-190, -112, 25, 0), (-15, -112, 30, 0), (8, -97, 30, 0), (45, -97, 30, 0), (68, -112, 30, 0), (225, -112, 20, 0), (225, 0, 15, 0), (135, 0, 15, 0), (135, 105, 18, 0), (248, 105, 20, 0), (248, 195, 25, 0), (-90, 195, 20, 0), (-90, 90, 15, 0), (-190, 90, 25, 0)],
    ),
    Design(
        "ice_lake",
        {"zh": "冰湖", "en": "Frozen Lake"},
        {"zh": "結冰的湖面，抓地力不到一半；只有雪地那兩段比較抓得住。", "en": "Ice under the wheels, less than half the grip; only two stretches of snow bite."},
        "ice", 4, 2, 16, 0.45, "spline",
        [(-300, 0, 0), (-250, -150, 0), (-50, -200, 0), (150, -160, 0), (320, -200, 0), (430, -60, 0), (330, 80, 0), (150, 60, 0), (40, 170, 0), (-150, 200, 0), (-280, 130, 0)],
        [(0.18, 0.28, 0.8, "snow"), (0.62, 0.72, 0.8, "snow")],
    ),
    Design(
        "desert",
        {"zh": "沙丘沙漠", "en": "Desert Dunes"},
        {"zh": "起伏的沙丘路，有兩段鬆軟的沙地，抓地變差。", "en": "Rolling dunes with two stretches of loose sand that steal the grip."},
        "desert", 3, 2, 14, 1.0, "fillet",
        [(-400, -150, 60, 0), (0, -230, 70, 10), (300, -120, 45, 4), (180, -20, 35, 12), (380, 80, 50, 6), (250, 230, 40, 14), (-50, 150, 45, 3), (-150, 260, 35, 10), (-420, 160, 60, 2)],
        [(0.30, 0.38, 0.6, "sand"), (0.70, 0.78, 0.6, "sand")],
    ),
    Design(
        "night",
        {"zh": "夜間賽道", "en": "Night Circuit"},
        {"zh": "只靠路燈和車燈的技術型賽道，彎道又急又多。", "en": "A twisty circuit lit only by lamps and headlights."},
        "night", 4, 3, 13, 1.0, "fillet",
        [(-320, -140, 35, 0), (120, -140, 20, 0), (200, -40, 30, 0), (100, 40, 15, 0), (260, 140, 40, 0), (0, 220, 25, 0), (-150, 100, 18, 0), (-260, 200, 30, 0), (-400, 60, 40, 0)],
    ),
    Design(
        "rain",
        {"zh": "雨中環道", "en": "Rain Ring"},
        {"zh": "下著雨的賽道，路面濕滑，積水的地方更滑。", "en": "Rain on the road, slippery everywhere and worse in the puddles."},
        "rain", 3, 3, 14, 0.7, "fillet",
        [(-350, -120, 60, 0), (-100, -200, 80, 0), (250, -180, 50, 0), (360, -40, 40, 0), (220, 40, 25, 0), (330, 160, 22, 0), (60, 200, 35, 0), (-40, 100, 30, 0), (-180, 190, 50, 0), (-380, 100, 60, 0)],
        [(0.12, 0.17, 0.7, "puddle"), (0.45, 0.50, 0.7, "puddle"), (0.80, 0.85, 0.7, "puddle")],
    ),
    Design(
        "grand_prix",
        {"zh": "終極大獎賽", "en": "Grand Prix"},
        {"zh": "最長的一條：髮夾彎、S 彎、高速彎、上下坡全都有。", "en": "The longest: a hairpin, esses, fast sweepers, hills, all of it."},
        "gp", 5, 2, 14, 1.0, "fillet",
        [(-500, -200, 40, 0), (300, -200, 15, 2), (300, -150, 15, 2), (100, -150, 60, 4), (40, -40, 35, 8), (200, 40, 30, 12), (60, 120, 30, 16), (260, 200, 50, 24), (420, 120, 40, 20), (480, 300, 60, 12), (-100, 340, 25, 6), (-140, 260, 20, 6), (-200, 300, 20, 6), (-420, 280, 50, 4), (-560, 60, 60, 2)],
    ),
]

BY_ID = {d.id: d for d in DESIGNS}


# ------------------------------------------------------------ drawing the path


def _fillet_path(points: list[tuple[float, ...]]) -> tuple[list[tuple[float, float]], list[tuple[float, float]]]:
    """A dense polyline of straights and arcs, and each corner's (distance along it, height)."""
    n = len(points)
    arcs = []
    for i in range(n):
        px, pz = points[i - 1][0], points[i - 1][1]
        vx, vz, radius = points[i][0], points[i][1], points[i][2]
        nx, nz = points[(i + 1) % n][0], points[(i + 1) % n][1]
        ax, az = px - vx, pz - vz
        bx, bz = nx - vx, nz - vz
        la, lb = math.hypot(ax, az), math.hypot(bx, bz)
        ax, az, bx, bz = ax / la, az / la, bx / lb, bz / lb
        phi = math.acos(max(-1.0, min(1.0, ax * bx + az * bz)))  # the inside angle
        cut = radius / math.tan(phi / 2)
        if cut > min(la, lb) / 2 + 1e-6:
            raise ValueError(f"corner {i} at ({vx}, {vz}): radius {radius} doesn't fit (needs {cut:.0f} m of each side)")
        t1 = (vx + ax * cut, vz + az * cut)
        t2 = (vx + bx * cut, vz + bz * cut)
        hx, hz = ax + bx, az + bz
        hl = math.hypot(hx, hz)
        cx, cz = vx + hx / hl * radius / math.sin(phi / 2), vz + hz / hl * radius / math.sin(phi / 2)
        a1 = math.atan2(t1[1] - cz, t1[0] - cx)
        a2 = math.atan2(t2[1] - cz, t2[0] - cx)
        sweep = (a2 - a1 + math.pi) % (2 * math.pi) - math.pi
        arcs.append((t1, t2, (cx, cz), radius, a1, sweep))
    path: list[tuple[float, float]] = []
    marks = []
    for i, (t1, t2, (cx, cz), radius, a1, sweep) in enumerate(arcs):
        steps = max(2, int(abs(sweep) * radius / 0.5))
        start = len(path)
        for k in range(steps + 1):
            a = a1 + sweep * k / steps
            path.append((cx + radius * math.cos(a), cz + radius * math.sin(a)))
        marks.append(((start + len(path) - 1) // 2, points[i][3] if len(points[i]) > 3 else 0.0))
        nxt = arcs[(i + 1) % n][0]
        length = math.dist(t2, nxt)
        steps = max(1, int(length / 0.5))
        for k in range(1, steps):
            path.append((t2[0] + (nxt[0] - t2[0]) * k / steps, t2[1] + (nxt[1] - t2[1]) * k / steps))
    return path, [(i, y) for i, y in marks]


def _spline_path(points: list[tuple[float, ...]]) -> tuple[list[tuple[float, float]], list[tuple[int, float]]]:
    """A closed centripetal Catmull-Rom curve through the points, densely, and each point's index."""
    n = len(points)
    path: list[tuple[float, float]] = []
    marks = []
    for i in range(n):
        p0, p1, p2, p3 = (points[(i + k) % n] for k in (-1, 0, 1, 2))
        marks.append((len(path), p1[2] if len(p1) > 2 else 0.0))

        def knot(t: float, a, b) -> float:
            return t + max(1e-6, math.dist(a[:2], b[:2])) ** 0.5

        t0 = 0.0
        t1 = knot(t0, p0, p1)
        t2 = knot(t1, p1, p2)
        t3 = knot(t2, p2, p3)
        steps = max(4, int(math.dist(p1[:2], p2[:2]) / 0.5))
        for k in range(steps):
            t = t1 + (t2 - t1) * k / steps
            point = []
            for d in range(2):
                a1 = (t1 - t) / (t1 - t0) * p0[d] + (t - t0) / (t1 - t0) * p1[d]
                a2 = (t2 - t) / (t2 - t1) * p1[d] + (t - t1) / (t2 - t1) * p2[d]
                a3 = (t3 - t) / (t3 - t2) * p2[d] + (t - t2) / (t3 - t2) * p3[d]
                b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
                b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
                point.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
            path.append((point[0], point[1]))
    return path, marks


def _resample(path: list[tuple[float, float]]) -> tuple[list[tuple[float, float]], list[float], float]:
    """Evenly spaced points (about DS apart) round the closed path, and where each path point was."""
    cum = [0.0]
    for a, b in zip(path, path[1:] + path[:1]):
        cum.append(cum[-1] + math.dist(a, b))
    total = cum[-1]
    n = max(16, round(total / DS))
    step = total / n
    out = []
    j = 0
    for k in range(n):
        s = k * step
        while cum[j + 1] < s:
            j += 1
        a, b = path[j], path[(j + 1) % len(path)]
        f = (s - cum[j]) / max(1e-9, cum[j + 1] - cum[j])
        out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
    return out, cum, total


# ------------------------------------------------------------ the track as the game sees it


def _frames(pts: list[tuple[float, float]], step: float) -> tuple[list[tuple[float, float]], list[tuple[float, float]], list[float]]:
    """Unit tangents, left normals and signed curvature (left +) at every point."""
    n = len(pts)
    tan = []
    for i in range(n):
        a, b = pts[i - 1], pts[(i + 1) % n]
        dx, dz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dz) or 1.0
        tan.append((dx / length, dz / length))
    nor = [(tz, -tx) for tx, tz in tan]
    curv = []
    for i in range(n):
        a, b = tan[i - 1], tan[(i + 1) % n]
        dtx, dtz = (b[0] - a[0]) / (2 * step), (b[1] - a[1]) / (2 * step)
        curv.append(dtx * nor[i][0] + dtz * nor[i][1])
    return tan, nor, curv


def _smooth(values: list[float], half: int) -> list[float]:
    n = len(values)
    return [sum(values[(i + k) % n] for k in range(-half, half + 1)) / (2 * half + 1) for i in range(n)]


def _racing_line(pts, nor, room: float) -> list[float]:
    """How far left of the centre the racing line runs at each point: the line that bends least
    inside the road (each point moved to where the bend through its neighbours is smoothest, over
    and over), first on every 4th point, then on all of them. A line pulled merely tight would
    hug the inside all the way round."""
    n = len(pts)

    def relax(idx: list[int], offs: list[float], rounds: int) -> list[float]:
        m = len(idx)

        def at(k: int) -> tuple[float, float]:
            k %= m
            i = idx[k]
            return pts[i][0] + nor[i][0] * offs[k], pts[i][1] + nor[i][1] * offs[k]

        for _ in range(rounds):
            for k in range(m):
                i = idx[k]
                a2, a1, b1, b2 = at(k - 2), at(k - 1), at(k + 1), at(k + 2)
                tx = (-a2[0] + 4 * a1[0] + 4 * b1[0] - b2[0]) / 6
                tz = (-a2[1] + 4 * a1[1] + 4 * b1[1] - b2[1]) / 6
                want = (tx - pts[i][0]) * nor[i][0] + (tz - pts[i][1]) * nor[i][1]
                offs[k] = max(-room, min(room, offs[k] + 0.7 * (want - offs[k])))
        return offs

    full = [0.0] * n
    # Coarse to fine: the long bends settle on a few points, the short ones on all of them.
    for every, rounds in ((16, 6000), (8, 3000), (4, 1500), (2, 600), (1, 300)):
        idx = list(range(0, n - every // 2, every))
        offs = relax(idx, [full[i] for i in idx], rounds)
        for k, i in enumerate(idx):
            j = idx[k + 1] if k + 1 < len(idx) else n
            for t in range(i, j):
                f = (t - i) / (j - i)
                full[t % n] = offs[k] * (1 - f) + offs[(k + 1) % len(idx)] * f
    return full


def _rotate(seq: list, start: int) -> list:
    return seq[start:] + seq[:start]


def build(design: Design) -> dict:
    if design.kind == "fillet":
        dense, marks = _fillet_path(design.points)
    else:
        dense, marks = _spline_path(design.points)
    pts, cum, total = _resample(dense)
    n = len(pts)
    step = total / n
    # Heights: each corner's (or point's) height at its place along the track, eased between.
    known = sorted(((cum[i] / total * n) % n, y) for i, y in marks)
    heights = []
    for k in range(n):
        for j in range(len(known)):
            a, b = known[j], known[(j + 1) % len(known)]
            span = (b[0] - a[0]) % n or n
            off = (k - a[0]) % n
            if off <= span:
                f = (1 - math.cos(math.pi * off / span)) / 2
                heights.append(a[1] + (b[1] - a[1]) * f)
                break
        else:
            heights.append(known[0][1])
    tan, nor, curv = _frames(pts, step)
    # Start 40% into the longest straight, so the cars set off along it.
    sm = _smooth(curv, 3)
    best, run_start, longest = 0, None, 0
    for k in range(2 * n):
        straight = abs(sm[k % n]) < 1 / 400
        if straight and run_start is None:
            run_start = k
        if (not straight or k == 2 * n - 1) and run_start is not None:
            if k - run_start > longest and run_start < n:
                longest, best = k - run_start, run_start
            run_start = None
    start = (best + int(longest * 0.4)) % n
    pts, heights = _rotate(pts, start), _rotate(heights, start)
    tan, nor, curv = _frames(pts, step)
    room = design.width / 2 - 1.6
    line = _racing_line(pts, nor, room)
    line_pts = [(p[0] + q[0] * d, p[1] + q[1] * d) for p, q, d in zip(pts, nor, line)]
    _, _, lcurv = _frames(line_pts, step)
    lcurv = _smooth(lcurv, 2)
    grip = [design.grip] * n
    zones = []
    for a, b, g, kind in design.zones:
        i0, i1 = int(a * n), int(b * n)
        for i in range(i0, i1):
            grip[i % n] = g
        zones.append({"from": i0, "to": i1, "kind": kind})
    # Where the road crosses itself: no walls there.
    open_ = [0] * n
    near = design.width + 2 * SHOULDER + 4
    cell: dict[tuple[int, int], list[int]] = {}
    for i, p in enumerate(pts):
        cell.setdefault((int(p[0] // 40), int(p[1] // 40)), []).append(i)
    for i, p in enumerate(pts):
        cx, cz = int(p[0] // 40), int(p[1] // 40)
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for j in cell.get((cx + dx, cz + dz), []):
                    gap = min((i - j) % n, (j - i) % n)
                    if gap * step > 60 and math.dist(p, pts[j]) < near:
                        open_[i] = 1
    corners = _corners(lcurv, grip, step)
    return {
        "id": design.id,
        "name": design.name,
        "blurb": design.blurb,
        "theme": design.theme,
        "stars": design.stars,
        "laps": design.laps,
        "width": design.width,
        "shoulder": SHOULDER,
        "ds": round(step, 4),
        "length": round(total, 1),
        "n": n,
        "x": [round(p[0], 2) for p in pts],
        "y": [round(h, 2) for h in heights],
        "z": [round(p[1], 2) for p in pts],
        "line": [round(d, 2) for d in line],
        "grip": [round(g, 2) for g in grip],
        "open": open_,
        "zones": zones,
        "corners": corners,
        "car": CAR,
    }


def _corners(curv: list[float], grip: list[float], step: float) -> list[dict]:
    n = len(curv)
    sharp = 1 / 150
    # Start where the line runs straight, so no corner is cut in two.
    zero = min(range(n), key=lambda i: abs(curv[i]))
    order = [(zero + k) % n for k in range(n)]
    runs: list[list[int]] = []
    for i in order:
        if abs(curv[i]) < sharp:
            continue
        side = 1 if curv[i] > 0 else -1
        if runs and side == runs[-1][0] and (order.index(i) - order.index(runs[-1][-1])) * step <= 30:
            runs[-1].append(i)
        else:
            runs.append([side, i])
    corners = []
    for run in runs:
        side, idx = run[0], run[1:]
        angle = abs(sum(curv[i] for i in idx)) * step
        if math.degrees(angle) < 15:
            continue
        radius = round(1 / max(abs(curv[i]) for i in idx))  # as the AI is told it
        g = min(grip[i] for i in idx)
        limit = math.sqrt(g * CAR["lat"] * radius) * 3.6
        corners.append({"from": idx[0], "to": idx[-1], "dir": "L" if side > 0 else "R", "angle": round(math.degrees(angle)), "radius": radius, "grip": g, "limit_kmh": round(limit)})
    corners.sort(key=lambda c: c["from"])
    for k, c in enumerate(corners):
        c["id"] = f"C{k + 1}"
        before = corners[k - 1]
        c["before"] = round(((c["from"] - before["to"]) % n) * step) if len(corners) > 1 else round(n * step)
    return corners


# ------------------------------------------------------------ files


def load(track_id: str) -> dict:
    return json.loads((DATA / f"{track_id}.json").read_text(encoding="utf-8"))


def svg(track: dict, size: int = 240, stroke: str = "#e2e8f0") -> str:
    """The track from above, for the lobby's cards."""
    xs, zs = track["x"], track["z"]
    lo_x, hi_x, lo_z, hi_z = min(xs), max(xs), min(zs), max(zs)
    pad = 12
    scale = (size - 2 * pad) / max(hi_x - lo_x, hi_z - lo_z)
    w = (hi_x - lo_x) * scale + 2 * pad
    h = (hi_z - lo_z) * scale + 2 * pad
    pts = " ".join(f"{(x - lo_x) * scale + pad:.1f},{(z - lo_z) * scale + pad:.1f}" for x, z in zip(xs[::2], zs[::2]))
    sx, sz = (xs[0] - lo_x) * scale + pad, (zs[0] - lo_z) * scale + pad
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}">'
        f'<polygon points="{pts}" fill="none" stroke="{stroke}" stroke-width="{max(2.5, track["width"] * scale):.1f}" stroke-linejoin="round" opacity="0.9"/>'
        f'<circle cx="{sx:.1f}" cy="{sz:.1f}" r="5" fill="#f59e0b"/></svg>'
    )


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    for design in DESIGNS:
        track = build(design)
        (DATA / f"{design.id}.json").write_text(json.dumps(track, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        corners = ", ".join(f"{c['id']} {c['dir']}{c['angle']}° r{c['radius']} {c['limit_kmh']}km/h" for c in track["corners"])
        print(f"{design.id}: {track['length']:.0f} m, {track['n']} points, open {sum(track['open'])}; {corners}")


if __name__ == "__main__":
    main()
