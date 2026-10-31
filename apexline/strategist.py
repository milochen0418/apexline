"""The AI racer's side of the race: what the AI Hub's model is told and how its plan is read.

The model can't steer a car 120 times a second, so it plans: a speed for every corner and how
hard to race the person (aggression 0 to 3). The game drives by that plan
(``assets/apexline/driver.js``); after each lap the model hears how every corner went (its
speed into it, its lowest, whether the car slid wide or hit the wall) and may change the plan.
It is told the physics of the car it drives this race (the person picks it; the game sends its
numbers: ``DrivenCar``), so a model that reasons it out finds each corner's speed:
√(grip × lat × radius).

Mindspar-style, the game holds no model or key: it asks the hub's role ``smart``
(``reflex_ddns_auth.ai``), and the hub's page chooses the model.
"""

from __future__ import annotations

import asyncio
import dataclasses
import math
import re
import time
import unicodedata
from typing import Any, AsyncIterator

from reflex_ddns_auth import ai

from apexline.trackgen import CAR

TOP_KMH = round(CAR["vmax"] * 3.6)
ROLE = "smart"
USES = {ROLE: "The AI racer: it plans its speed for every corner and how hard to race you, and changes the plan after every lap"}
# Thinking models spend most of these thinking.
MAX_TOKENS = 12000
HEARTBEAT = 2.0  # seconds between "still thinking" lines
KEEP = 10  # the last messages of a long race kept, after the first two

SYSTEM = {
    "zh": (
        "你是賽車遊戲「極速對決」裡的 AI 車手，對手是一位真人玩家。\n"
        "你不用自己握方向盤：電腦照你的計畫開車——沿著賽車線開、直線全油門，每個彎道用你訂的速度過彎（進彎前會自動煞到這個速度）。"
        "過彎太快，輪胎抓不住，車子會往外滑、撞牆、大幅掉速；太慢則白白浪費時間。\n"
        "{car}物理：車子最高 {top} km/h；過彎時最大的側向加速度 = 路面抓地係數 × {lat} m/s²；煞車的減速度 = 抓地係數 × {brake} m/s²。\n"
        "你也決定怎麼對付對手（積極度）：0＝遠遠避開；1＝正常比賽，從空的一側超車；2＝對手緊跟在後時擋他的路；3＝故意去撞對手。"
        "撞車兩台都會掉速，也可能被撞去撞牆。\n"
        "回覆只寫下面這些行，不要寫別的：\n"
        "C1: <過彎速度，km/h 的整數>\n"
        "C2: <過彎速度>\n"
        "…（每個彎道一行）\n"
        "積極度: <0、1、2 或 3>\n"
        "說明: <一句話，說你的想法>"
    ),
    "en": (
        "You are the AI driver in the racing game Apexline, racing a person.\n"
        "You don't steer yourself: the computer drives by your plan. It follows the racing line, goes flat out on the straights, "
        "and takes every corner at the speed you set (braking to it before the corner). "
        "Too fast into a corner and the tyres can't hold: the car slides wide, hits the wall and loses a lot of speed; too slow wastes time.\n"
        "{car}Physics: top speed {top} km/h; the most sideways acceleration in a corner = the road's grip × {lat} m/s²; braking = grip × {brake} m/s².\n"
        "You also decide how to race the other car (aggression): 0 = keep well clear; 1 = race clean, pass on the side with room; "
        "2 = also block them when they are right behind you; 3 = also ram them on purpose. A knock slows both cars and may push one into the wall.\n"
        "Reply with exactly these lines and nothing else:\n"
        "C1: <corner speed, whole km/h>\n"
        "C2: <corner speed>\n"
        "… (one line per corner)\n"
        "Aggression: <0, 1, 2 or 3>\n"
        "Note: <one sentence on your thinking>"
    ),
}

CAR_LINE = {"zh": "這場你開的車是「{name}」。\n", "en": "You drive the {name} this race.\n"}


@dataclasses.dataclass(frozen=True)
class DrivenCar:
    """The car the AI drives, as the game says it (``game.js`` aiCarFacts, ``garage.js``)."""

    id: str = "gt"
    name: str = ""
    top: int = TOP_KMH  # km/h
    lat: float = CAR["lat"]
    brake: float = CAR["brake"]

    def limit(self, corner: dict) -> float:
        """What the grip allows this car in a corner: the track's figure is for trackgen.CAR."""
        return corner["limit_kmh"] * math.sqrt(self.lat / CAR["lat"])


def car_from(value: Any) -> DrivenCar:
    """The car in a request; anything that doesn't read as one is the road's car."""
    if not isinstance(value, dict):
        return DrivenCar()
    numbers = [value.get(key) for key in ("top", "lat", "brake")]
    if not re.fullmatch(r"[a-z0-9_]{1,24}", str(value.get("id"))) or not all(isinstance(n, (int, float)) and not isinstance(n, bool) and 1 <= n <= 500 for n in numbers):
        return DrivenCar()
    name = re.sub(r"[\x00-\x1f]", "", str(value.get("name") or ""))[:30]
    return DrivenCar(str(value["id"]), name, round(numbers[0]), float(numbers[1]), float(numbers[2]))


def system(lang: str, car: DrivenCar) -> str:
    """What the model is told once, with its car's numbers."""
    line = CAR_LINE[lang].format(name=car.name) if car.name else ""
    return SYSTEM[lang].format(car=line, top=car.top, lat=f"{car.lat:g}", brake=f"{car.brake:g}")


ZONE_WORDS = {"zh": {"sand": "沙地", "snow": "雪地", "puddle": "積水", "ice": "冰面"}, "en": {"sand": "sand", "snow": "snow", "puddle": "puddles", "ice": "ice"}}


def _zone_of(track: dict, corner: dict) -> str:
    for zone in track.get("zones", []):
        n = track["n"]
        span = (zone["to"] - zone["from"]) % n
        if (corner["from"] - zone["from"]) % n <= span or (corner["to"] - zone["from"]) % n <= span:
            return zone["kind"]
    return ""


def brief(track: dict, lang: str) -> str:
    """The track, as the model first hears of it."""
    base = max(set(track["grip"]), key=track["grip"].count)
    if lang == "zh":
        lines = [f"賽道「{track['name']['zh']}」：一圈 {track['length']:.0f} 公尺、路寬 {track['width']:g} 公尺、比賽 {track['laps']} 圈，路面抓地係數 {base:g}。", "彎道依序如下（半徑是賽車線上最緊的地方）："]
        for c in track["corners"]:
            zone = _zone_of(track, c)
            where = f"（{ZONE_WORDS['zh'][zone]}）" if zone and c["grip"] != base else ""
            lines.append(f"{c['id']}：{'左' if c['dir'] == 'L' else '右'}彎 {c['angle']}°，半徑 {c['radius']} 公尺，抓地 {c['grip']:g}{where}，彎前直線 {c['before']} 公尺")
    else:
        lines = [f"Track “{track['name']['en']}”: {track['length']:.0f} m a lap, {track['width']:g} m wide, {track['laps']} laps, road grip {base:g}.", "The corners in order (the radius is the tightest point of the racing line):"]
        for c in track["corners"]:
            zone = _zone_of(track, c)
            where = f" ({ZONE_WORDS['en'][zone]})" if zone and c["grip"] != base else ""
            lines.append(f"{c['id']}: {'left' if c['dir'] == 'L' else 'right'} {c['angle']}°, radius {c['radius']} m, grip {c['grip']:g}{where}, {c['before']} m of straight before it")
    return "\n".join(lines)


def _plan_line(plan: dict, track: dict, lang: str) -> str:
    speeds = plan.get("speeds") or {}
    parts = [f"{c['id']} {speeds[c['id']]}" for c in track["corners"] if c["id"] in speeds]
    aggression = plan.get("aggression", 1)
    if lang == "zh":
        return f"你現在用的計畫：{'、'.join(parts)}，積極度 {aggression}。"
    return f"The plan you are driving: {', '.join(parts)}, aggression {aggression}."


def _kmh(value) -> str:
    return "—" if value is None else str(value)


def _metres(value) -> str:
    try:
        return f"{float(value):.1f}"
    except (TypeError, ValueError):
        return "0.0"


def debrief(report: dict, lang: str) -> str:
    """How the lap went."""
    lap = int(report.get("lap") or 0)
    secs = report.get("secs")
    rival = report.get("rival_secs")
    ahead = report.get("ahead_m")
    bumps = int(report.get("bumps") or 0)
    lines = []
    if lang == "zh":
        head = f"第 {lap} 圈跑完：你這圈 {secs} 秒"
        head += f"，對手這圈 {rival} 秒" if rival is not None else "，對手還沒跑完這圈"
        if isinstance(ahead, (int, float)):
            head += f"；你領先對手約 {abs(ahead)} 公尺" if ahead >= 0 else f"；你落後對手約 {abs(ahead)} 公尺"
        head += f"；這圈和對手相撞 {bumps} 次。" if bumps else "。"
        lines += [head, "各彎道（計畫速度 → 進彎速度 / 彎中最低速度，偏離賽車線多遠）："]
        for c in report.get("corners") or []:
            what = f"偏離賽車線 {_metres(c.get('wide'))} 公尺" + ("，撞牆了" if c.get("wall") else "")
            lines.append(f"{c.get('id')}：計畫 {c.get('plan') or '—'} → 進彎 {_kmh(c.get('entry'))} / 最低 {_kmh(c.get('min'))}，{what}")
        lines.append(f"請給第 {lap + 1} 圈的計畫（每個彎道都要寫）。")
    else:
        head = f"Lap {lap} done: your lap {secs} s"
        head += f", the other car's {rival} s" if rival is not None else ", the other car hasn't finished this lap"
        if isinstance(ahead, (int, float)):
            head += f"; you are about {abs(ahead)} m ahead" if ahead >= 0 else f"; you are about {abs(ahead)} m behind"
        head += f"; {bumps} knock{'s' if bumps != 1 else ''} with the other car this lap." if bumps else "."
        lines += [head, "Each corner (planned speed → speed into it / lowest in it, how far off the racing line):"]
        for c in report.get("corners") or []:
            what = f"{_metres(c.get('wide'))} m off the line" + (", hit the wall" if c.get("wall") else "")
            lines.append(f"{c.get('id')}: plan {c.get('plan') or '—'} → in {_kmh(c.get('entry'))} / lowest {_kmh(c.get('min'))}, {what}")
        lines.append(f"Give your plan for lap {lap + 1} (every corner).")
    return "\n".join(lines)


def user_message(track: dict, lang: str, history: list[dict[str, str]], report: dict | None, plan: dict | None) -> str:
    """What the game says next: the track first (and the plan in use, when the model hasn't made
    it in this conversation), then the lap that just ended."""
    parts = []
    if not history:
        parts.append(brief(track, lang))
        if plan and plan.get("speeds"):
            parts.append(_plan_line(plan, track, lang))
    if report:
        parts.append(debrief(report, lang))
    elif not history:
        parts.append("請給第 1 圈的計畫。" if lang == "zh" else "Give your plan for lap 1.")
    return "\n\n".join(parts)


@dataclasses.dataclass
class Plan:
    speeds: dict[str, int]
    aggression: int
    note: str
    complete: bool  # every corner had a speed of its own

    def to_json(self) -> dict[str, Any]:
        return {"speeds": self.speeds, "aggression": self.aggression, "note": self.note, "complete": self.complete}


_CORNER = re.compile(r"\bC\s*(\d+)\s*[:：=]\s*(\d+(?:\.\d+)?)", re.IGNORECASE)
_AGGRESSION = re.compile(r"(?:積極度|攻擊性|aggression)\s*[:：=]\s*([0-3])", re.IGNORECASE)
_NOTE = re.compile(r"^\s*(?:說明|理由|想法|note|reason|why)\s*[:：]\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE)
_THINKING = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def parse(text: str, track: dict, previous: dict | None = None, car: DrivenCar = DrivenCar()) -> Plan | None:
    """The plan in the model's reply, or None when it gave speeds for fewer than half the
    corners. A corner it left out keeps the previous plan's speed (or 70% of its limit)."""
    clean = unicodedata.normalize("NFKC", _THINKING.sub("", text or "")).replace("**", "").replace("`", "")
    ids = [c["id"] for c in track["corners"]]
    found: dict[str, int] = {}
    for num, value in _CORNER.findall(clean):
        key = f"C{int(num)}"
        if key in ids and key not in found:
            found[key] = int(max(10, min(car.top, round(float(value)))))
    if len(found) * 2 < len(ids):
        return None
    before = (previous or {}).get("speeds") or {}
    speeds = {}
    for c in track["corners"]:
        if c["id"] in found:
            speeds[c["id"]] = found[c["id"]]
        else:
            speeds[c["id"]] = int(before.get(c["id"]) or round(car.limit(c) * 0.7))
    m = _AGGRESSION.search(clean)
    aggression = int(m.group(1)) if m else int((previous or {}).get("aggression", 1))
    note = _NOTE.search(_THINKING.sub("", text or "").replace("**", "").replace("`", ""))  # as written: "，" stays
    return Plan(speeds, aggression, note.group(1)[:200] if note else "", len(found) == len(ids))


def trim(history: list[dict[str, str]]) -> list[dict[str, str]]:
    """The conversation sent again: the track and first plan, then the latest laps."""
    ok = [{"role": m["role"], "content": str(m["content"])[:6000]} for m in history if isinstance(m, dict) and m.get("role") in ("user", "assistant") and m.get("content")]
    if len(ok) > KEEP + 2:
        ok = ok[:2] + ok[-KEEP:]
    if len(ok) % 2:  # pairs of the game's words and the model's answer
        ok = ok[:-1]
    return ok


async def _ask(messages: list[dict[str, str]], lang: str, car: DrivenCar) -> tuple[str, str, str]:
    reply = ai.stream(ROLE, system(lang, car), messages, max_tokens=MAX_TOKENS)
    text = "".join([piece async for piece in reply])
    return text, reply.model, reply.stop


async def plan_lines(track: dict, lang: str, history: list[dict[str, str]], report: dict | None, plan: dict | None, car: DrivenCar = DrivenCar()) -> AsyncIterator[dict[str, Any]]:
    """The answer as the game reads it: ``{"t": seconds}`` while the model thinks, then
    ``{"plan", "model", "secs", "said", "reply"}`` or ``{"error"}``. Stopping early (the race
    left) cancels the question, and the hub stops the model."""
    lang = lang if lang in SYSTEM else "zh"
    history = trim(history)
    said = user_message(track, lang, history, report, plan)
    started = time.monotonic()
    task = asyncio.create_task(_ask([*history, {"role": "user", "content": said}], lang, car))
    try:
        while not task.done():
            done, _ = await asyncio.wait({task}, timeout=HEARTBEAT)
            if not done:
                yield {"t": round(time.monotonic() - started)}
        try:
            text, model, stop = task.result()
        except ai.HubUnavailable as e:
            yield {"error": str(e)}
            return
        except Exception as e:  # noqa: BLE001 - told to the game, which keeps its plan
            yield {"error": f"{type(e).__name__}: {e}"}
            return
    finally:
        if not task.done():
            task.cancel()
    secs = round(time.monotonic() - started, 1)
    parsed = parse(text, track, plan, car)
    if parsed is None:
        why = "想太久，字數用完了還沒寫出計畫" if lang == "zh" and stop == "max_tokens" else "thought so long it ran out of room" if stop == "max_tokens" else ("回答裡找不到計畫" if lang == "zh" else "no plan in its answer")
        yield {"error": why, "reply": text[:500], "model": model, "secs": secs}
        return
    yield {"plan": parsed.to_json(), "model": model, "secs": secs, "said": said, "reply": text}
