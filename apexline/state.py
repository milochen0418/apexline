"""The lobby (the tracks, your records against the opponent) and the race page's side of a race:
which track, the words for the game, and keeping the result when it ends."""

from __future__ import annotations

import dataclasses
import functools
import urllib.parse
from typing import Any
from urllib.parse import urlsplit

import reflex as rx
from reflex_ddns_auth import ai

from apexline import store, strategist, trackgen
from apexline.i18n import RACE, TEXT


def _clock(secs: float | None) -> str:
    if secs is None:
        return "—"
    m, s = divmod(secs, 60)
    return f"{int(m)}:{s:04.1f}"


@functools.lru_cache(maxsize=1)
def _facts() -> dict[str, dict[str, Any]]:
    out = {}
    for d in trackgen.DESIGNS:
        pack = trackgen.load(d.id)
        svg = trackgen.svg(pack)
        out[d.id] = {
            "length": round(pack["length"]),
            "corners": len(pack["corners"]),
            "grip": f"{d.grip:g}",
            "svg": "data:image/svg+xml;utf8," + urllib.parse.quote(svg),
        }
    return out


@dataclasses.dataclass
class Card:
    id: str
    name: str
    blurb: str
    theme: str
    stars: str
    laps: int
    metres: int
    corners: int
    grip: str
    svg: str
    you_best: str
    ai_best: str
    record: str
    remembers: str


class Lobby(rx.State):
    lang: str = rx.LocalStorage("", name="apexline_lang")
    hub_state: str = "asking"  # asking, ok, none (no hub) or error
    hub_error: str = ""
    opponent: str = ""
    cards: list[Card] = []

    @rx.var
    def t(self) -> dict[str, str]:
        return TEXT.get(self.lang, TEXT["zh"])

    @rx.var
    def hub_page(self) -> str:
        """The AI Hub's page, next to this app on the same domain ("" when run on its own)."""
        parts = urlsplit(self.router.headers.origin or "")
        host = parts.hostname or ""
        if "." not in host or host.replace(".", "").isdigit():
            return ""
        return f"{parts.scheme}://ai.{host.split('.', 1)[1]}"

    def _detect_lang(self) -> None:
        if self.lang not in TEXT:
            self.lang = "zh" if "zh" in (self.router.headers.accept_language or "").lower() else "en"

    def _load_cards(self) -> None:
        words = self.t
        records = store.records(self.opponent)
        facts = _facts()
        lang = self.lang if self.lang in TEXT else "zh"
        cards = []
        for d in trackgen.DESIGNS:
            f = facts[d.id]
            rec = records.get(d.id, store.Record())
            played = rec.wins + rec.losses
            cards.append(
                Card(
                    id=d.id,
                    name=d.name[lang],
                    blurb=d.blurb[lang],
                    theme=words.get(f"theme_{d.theme}", d.theme),
                    stars="★" * d.stars + "☆" * (5 - d.stars),
                    laps=d.laps,
                    metres=f["length"],
                    corners=f["corners"],
                    grip=f["grip"],
                    svg=f["svg"],
                    you_best=_clock(rec.you_best) if rec.you_best is not None else "",
                    ai_best=_clock(rec.ai_best) if rec.ai_best is not None else "",
                    record=words["record"].format(w=rec.wins, l=rec.losses) if played else "",
                    remembers=words["remembers"].format(v=rec.remembered) if rec.remembered else "",
                )
            )
        self.cards = cards

    @rx.event
    def on_load(self):
        self._detect_lang()
        self._load_cards()
        return Lobby.check_opponent

    @rx.event
    def switch_lang(self):
        self.lang = "en" if self.lang == "zh" else "zh"
        self._load_cards()

    @rx.event(background=True)
    async def check_opponent(self):
        async with self:
            self.hub_state = "asking"
        status = await ai.status(strategist.ROLE)
        async with self:
            if status is None:
                self.hub_state, self.opponent = "none", ""
            elif status.get("ok"):
                self.hub_state, self.opponent = "ok", str(status.get("model") or "")
            else:
                self.hub_state, self.opponent = "error", ""
                self.hub_error = str(status.get("error") or "")
            self._load_cards()


class Race(Lobby):
    @rx.var
    def labels(self) -> dict[str, str]:
        return RACE.get(self.lang, RACE["zh"])

    @rx.var
    def track_id(self) -> str:
        parts = [p for p in str(self.router.url.path or "").split("/") if p]
        return parts[1] if len(parts) > 1 and parts[0] == "race" and parts[1] in trackgen.BY_ID else ""

    @rx.event
    def load_race(self):
        self._detect_lang()
        if not self.track_id:
            return rx.redirect("/")
        return Lobby.check_opponent

    @rx.event
    def handle(self, event: dict[str, Any]):
        kind = event.get("type") if isinstance(event, dict) else None
        if kind == "finished" and isinstance(event.get("result"), dict):
            result = event["result"]
            if result.get("track") in trackgen.BY_ID:
                store.save_race(result)
        elif kind == "leave":
            return rx.redirect("/")
