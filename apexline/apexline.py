"""Apexline (極速對決): a 3D race against the AI the AI Hub sets for this app, side by side on
one screen, on ten tracks.

``/`` is the lobby; ``/race/<track>`` the race (``assets/apexline/``, three.js). The AI plans
its driving through the hub (:mod:`apexline.strategist`), asked through the game's own routes
(:mod:`apexline.api`).
"""

import reflex as rx
from reflex_ddns_auth import ai

from apexline import strategist
from apexline.api import api
from apexline.state import Lobby, Race
from apexline.views import lobby_page, race_page

app = rx.App(
    head_components=[
        rx.el.link(rel="preconnect", href="https://fonts.googleapis.com"),
        rx.el.link(rel="preconnect", href="https://fonts.gstatic.com", cross_origin=""),
        rx.el.link(href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600;800&display=swap", rel="stylesheet"),
        rx.el.link(rel="stylesheet", href="/apexline/apexline.css"),
    ],
    # The game's own routes (tracks, the AI's plans), next to Reflex's.
    api_transformer=api,
)
app.add_page(lobby_page, route="/", title="Apexline · 極速對決", on_load=Lobby.on_load)
app.add_page(race_page, route="/race/[track]", title="Apexline · 極速對決", on_load=Race.load_race)

# The AI Hub's page lists this app's AI by these words, with the model it answers with.
ai.uses(app, **strategist.USES)
