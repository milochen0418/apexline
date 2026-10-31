"""The race: a local React component (``assets/apexline/race.jsx``) wrapped for Reflex.

The JS files are plain assets (Reflex copies ``assets/`` into the frontend), imported by
``importable_path`` as CAD Roam's world is; the modules next to race.jsx are imported
relatively. three.js is an npm package bundled by Vite (``lib_dependencies``), so the page needs
nothing from a CDN at run time.
"""

import reflex as rx

_JS = rx.asset("apexline/race.jsx")
for _name in ("game.js", "physics.js", "driver.js", "garage.js", "guide.js", "scenery.js", "cars.js", "carshapes.js", "bodywork.js", "livery.js", "wheels.js", "hud.js", "input.js", "sound.js", "music.js", "planner.js", "apexline.css"):
    rx.asset(f"apexline/{_name}")

LIBS = ["three@0.186.1"]


class ApexRace(rx.Component):
    library = _JS.importable_path
    tag = "ApexRace"
    lib_dependencies: list[str] = LIBS

    # The track's id (apexline/trackgen.py).
    track: rx.Var[str]
    # Any URL of the backend: the game's own routes (/_apexline/...) are resolved against it.
    backend: rx.Var[str]
    # The race's words (apexline/i18n.py RACE).
    labels: rx.Var[dict]
    lang: rx.Var[str]
    # The model the AI Hub answers with, as it says it.
    opponent: rx.Var[str]
    # The song just chosen in Music Box or kept in Music Studio.
    song: rx.Var[dict]
    on_event: rx.EventHandler[lambda e: [e]]


apex_race = ApexRace.create
