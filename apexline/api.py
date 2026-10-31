"""The game's own backend routes, next to Reflex's (``backend-paths.txt`` sends ``/_apexline/``
here behind re-ddns):

- ``GET /_apexline/track/<id>``: a track as the game drives it (``apexline/data/tracks``);
- ``POST /_apexline/plan``: the AI's plan, streamed as lines of JSON (:mod:`apexline.strategist`).
  ``{track, lang, car, history, report, plan, fresh, lap}``; with no conversation yet and no lap,
  the plan the answering model remembers for this track and car comes back at once
  (``"cached": true``), unless ``fresh``.
"""

from __future__ import annotations

import functools
import json
import logging
from typing import Any, AsyncIterator

from reflex_ddns_auth import ai
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, StreamingResponse
from starlette.routing import Route

from apexline import store, strategist, trackgen

logger = logging.getLogger(__name__)


@functools.lru_cache(maxsize=16)
def _track_text(track_id: str) -> str:
    return (trackgen.DATA / f"{track_id}.json").read_text(encoding="utf-8")


def track_pack(track_id: str) -> dict[str, Any] | None:
    if track_id not in trackgen.BY_ID:
        return None
    return json.loads(_track_text(track_id))


async def track(request: Request) -> Response:
    track_id = request.path_params["track_id"]
    if track_id not in trackgen.BY_ID:
        return JSONResponse({"error": f"no track {track_id!r}"}, status_code=404)
    return Response(_track_text(track_id), media_type="application/json", headers={"Cache-Control": "no-cache"})


async def _lines(events: AsyncIterator[dict[str, Any]]) -> AsyncIterator[str]:
    try:
        async for event in events:
            yield json.dumps(event, ensure_ascii=False) + "\n"
    except Exception as e:  # noqa: BLE001 - the game shows it and keeps its plan
        logger.warning("Planning failed: %s", e)
        yield json.dumps({"error": f"{type(e).__name__}: {e}"}, ensure_ascii=False) + "\n"


async def _remembered(plan: dict[str, Any], model: str) -> AsyncIterator[dict[str, Any]]:
    yield {"plan": {**plan, "complete": True}, "model": model, "secs": 0, "cached": True}


async def plan(request: Request) -> Response:
    try:
        body = await request.json()
        assert isinstance(body, dict)
    except (ValueError, AssertionError):
        return JSONResponse({"error": "expected JSON"}, status_code=400)
    pack = track_pack(str(body.get("track") or ""))
    if pack is None:
        return JSONResponse({"error": "no such track"}, status_code=404)
    lang = "en" if body.get("lang") == "en" else "zh"
    history = body.get("history") if isinstance(body.get("history"), list) else []
    report = body.get("report") if isinstance(body.get("report"), dict) else None
    current = body.get("plan") if isinstance(body.get("plan"), dict) else None
    car = strategist.car_from(body.get("car"))
    headers = {"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
    if not history and report is None and not body.get("fresh"):
        status = await ai.status(strategist.ROLE)
        model = str((status or {}).get("model") or "") if (status or {}).get("ok") else ""
        remembered = store.memory(pack["id"], model, car.id)
        if remembered:
            return StreamingResponse(_lines(_remembered(remembered, model)), media_type="application/x-ndjson", headers=headers)
    events = strategist.plan_lines(pack, lang, history, report, current, car)
    return StreamingResponse(_lines(events), media_type="application/x-ndjson", headers=headers)


api = Starlette(
    routes=[
        Route("/_apexline/track/{track_id}", track, methods=["GET"]),
        Route("/_apexline/plan", plan, methods=["POST"]),
    ]
)
