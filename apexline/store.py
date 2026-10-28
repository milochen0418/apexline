"""Races kept, per track and per model, in ``APEXLINE_DATA_DIR`` (``~/.local/share/apexline``;
the App Store keeps it in a volume):

- ``races.jsonl``: one finished race a line, as the game reports it (``game.js`` ``finish``):
  ``{"track", "model", "winner", "you": {"time", "best", ...}, "ai": {...}, "plans", "plan"}``;
- ``memory.json``: the last plan each model drove on each track, which it starts from the next
  time it races there (it "remembers the track").
"""

from __future__ import annotations

import dataclasses
import json
import os
import threading
import time
from pathlib import Path
from typing import Any

_lock = threading.Lock()


def data_dir() -> Path:
    return Path(os.environ.get("APEXLINE_DATA_DIR") or Path.home() / ".local" / "share" / "apexline")


def _key(track: str, model: str) -> str:
    return f"{track}|{model}"


def _read_memory() -> dict[str, Any]:
    path = data_dir() / "memory.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def memory(track: str, model: str) -> dict[str, Any] | None:
    """The plan ``model`` last drove on ``track``, or None."""
    if not model:
        return None
    with _lock:
        plan = _read_memory().get(_key(track, model))
    return plan if isinstance(plan, dict) and isinstance(plan.get("speeds"), dict) else None


def save_race(result: dict[str, Any]) -> None:
    track, model = str(result.get("track") or ""), str(result.get("model") or "")
    if not track:
        return
    record = {"at": round(time.time()), **result}
    with _lock:
        path = data_dir()
        path.mkdir(parents=True, exist_ok=True)
        with (path / "races.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        plan = result.get("plan")
        if model and isinstance(plan, dict) and isinstance(plan.get("speeds"), dict):
            mem = _read_memory()
            mem[_key(track, model)] = {"speeds": plan["speeds"], "aggression": plan.get("aggression", 1), "note": plan.get("note", ""), "version": plan.get("version", 1), "at": record["at"]}
            tmp = path / "memory.json.tmp"
            tmp.write_text(json.dumps(mem, ensure_ascii=False, indent=1), encoding="utf-8")
            tmp.replace(path / "memory.json")


def races() -> list[dict[str, Any]]:
    path = data_dir() / "races.jsonl"
    if not path.exists():
        return []
    out = []
    with _lock, path.open(encoding="utf-8") as f:
        for line in f:
            try:
                race = json.loads(line)
            except ValueError:
                continue
            if isinstance(race, dict) and race.get("track"):
                out.append(race)
    return out


@dataclasses.dataclass
class Record:
    you_best: float | None = None  # your fastest finished race on the track (seconds)
    ai_best: float | None = None  # the model's fastest
    wins: int = 0  # your wins against the model
    losses: int = 0
    remembered: int = 0  # the version of the plan the model remembers (0: none)


def records(model: str) -> dict[str, Record]:
    """Per track: your best time, ``model``'s best and your wins and losses against it."""
    out: dict[str, Record] = {}
    for race in races():
        rec = out.setdefault(race["track"], Record())
        you = (race.get("you") or {}).get("time")
        if isinstance(you, (int, float)):
            rec.you_best = you if rec.you_best is None else min(rec.you_best, you)
        if race.get("model") != model:
            continue
        them = (race.get("ai") or {}).get("time")
        if isinstance(them, (int, float)):
            rec.ai_best = them if rec.ai_best is None else min(rec.ai_best, them)
        if race.get("winner") == "you":
            rec.wins += 1
        elif race.get("winner") == "ai":
            rec.losses += 1
    with _lock:
        mem = _read_memory()
    for key, plan in mem.items():
        track, _, who = key.partition("|")
        if who == model and isinstance(plan, dict):
            out.setdefault(track, Record()).remembered = int(plan.get("version") or 1)
    return out
