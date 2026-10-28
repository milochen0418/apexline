"""The lobby (/: the opponent, how the AI drives, the ten tracks) and the race (/race/<id>)."""

from __future__ import annotations

import reflex as rx

from apexline.components import apex_race
from apexline.state import Card, Lobby, Race

T = Lobby.t
CARD = "rounded-2xl border border-white/10 bg-slate-900/70 p-4 sm:p-5"


def header() -> rx.Component:
    return rx.el.header(
        rx.el.div(
            rx.icon("flag", size=22, class_name="text-amber-400"),
            rx.el.span(T["app"], class_name="text-lg font-bold tracking-wide"),
            rx.el.span("Apexline", class_name="hidden text-sm text-slate-500 sm:inline"),
            class_name="flex items-center gap-2",
        ),
        rx.el.button(
            rx.icon("languages", size=16),
            T["lang_other"],
            on_click=Lobby.switch_lang,
            data_testid="lang",
            class_name="flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-slate-500",
        ),
        class_name="flex items-center justify-between py-4",
    )


def opponent_card() -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.icon("bot", size=28, class_name="text-sky-300"),
            rx.el.div(
                rx.el.div(T["opponent"], class_name="text-xs uppercase tracking-wider text-slate-400"),
                rx.match(
                    Lobby.hub_state,
                    ("asking", rx.el.div(T["asking_hub"], data_testid="asking", class_name="text-slate-300")),
                    ("ok", rx.el.div(Lobby.opponent, data_testid="opponent", class_name="font-mono text-lg font-semibold text-sky-200 break-all")),
                    ("none", rx.el.div(T["no_hub"], class_name="text-rose-300")),
                    rx.el.div(T["hub_error"], " ", Lobby.hub_error, class_name="text-rose-300 break-words"),
                ),
                class_name="min-w-0",
            ),
            class_name="flex items-start gap-3",
        ),
        rx.el.p(T["change_model_help"], class_name="mt-3 text-sm leading-relaxed text-slate-400"),
        rx.cond(
            Lobby.hub_page != "",
            rx.el.a(T["change_model"], rx.icon("external-link", size=14), href=Lobby.hub_page, target="_blank", class_name="mt-2 inline-flex items-center gap-1 text-sm text-sky-300 hover:underline"),
        ),
        class_name=CARD,
    )


def how_card() -> rx.Component:
    return rx.el.div(
        rx.el.div(rx.icon("brain", size=18, class_name="text-amber-300"), T["how_title"], class_name="flex items-center gap-2 font-semibold"),
        rx.el.ol(
            rx.el.li(T["how_1"]),
            rx.el.li(T["how_2"]),
            rx.el.li(T["how_3"]),
            class_name="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-300",
        ),
        class_name=CARD,
    )


def _fact(icon: str, text) -> rx.Component:
    return rx.el.span(rx.icon(icon, size=13), text, class_name="inline-flex items-center gap-1")


def track_card(card: Card) -> rx.Component:
    return rx.el.div(
        rx.el.div(
            rx.image(src=card.svg, alt="", class_name="h-full w-full object-contain"),
            rx.el.span(card.theme, class_name="absolute left-2 top-2 rounded-full bg-slate-950/80 px-2 py-0.5 text-[11px] text-slate-200"),
            class_name="relative h-32 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 p-2",
        ),
        rx.el.div(
            rx.el.div(card.name, class_name="font-semibold text-slate-100"),
            rx.el.span(card.stars, class_name="text-xs tracking-tight text-amber-300"),
            class_name="mt-3 flex items-center justify-between gap-2",
        ),
        rx.el.p(card.blurb, class_name="mt-1 min-h-[2.5rem] text-xs leading-relaxed text-slate-400"),
        rx.el.div(
            _fact("repeat", rx.el.span(card.laps, " ", T["laps"])),
            _fact("ruler", rx.el.span(card.metres, " ", T["metres"])),
            _fact("corner-down-right", rx.el.span(card.corners, " ", T["corners"])),
            _fact("snowflake", rx.el.span(T["grip"], " ", card.grip)),
            class_name="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400",
        ),
        rx.el.div(
            rx.cond(card.you_best != "", rx.el.span(T["you_best"], " ", rx.el.span(card.you_best, class_name="font-mono text-rose-300"))),
            rx.cond(card.ai_best != "", rx.el.span(T["ai_best"], " ", rx.el.span(card.ai_best, class_name="font-mono text-sky-300"))),
            rx.cond(card.record != "", rx.el.span(card.record, class_name="text-slate-300")),
            class_name="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400",
        ),
        rx.cond(card.remembers != "", rx.el.div(rx.icon("bookmark-check", size=12), card.remembers, class_name="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-300")),
        rx.link(
            rx.el.span(rx.icon("flag", size=15), T["race"], class_name="flex items-center justify-center gap-1.5"),
            href="/race/" + card.id,
            data_testid="race-" + card.id,
            class_name="mt-3 block rounded-xl bg-amber-400 py-2 text-center text-sm font-semibold text-slate-950 hover:bg-amber-300",
            underline="none",
        ),
        data_testid="track-card",
        class_name="flex flex-col rounded-2xl border border-white/10 bg-slate-900/70 p-3",
    )


def lobby_page() -> rx.Component:
    return rx.el.div(
        rx.el.div(
            header(),
            rx.el.div(
                rx.el.h1(T["app"], class_name="text-3xl font-bold sm:text-4xl"),
                rx.el.p(T["tagline"], class_name="mt-2 text-slate-300"),
                class_name="py-3",
            ),
            rx.el.div(opponent_card(), how_card(), class_name="grid gap-4 md:grid-cols-2"),
            rx.el.h2(T["tracks"], class_name="mt-8 mb-3 text-xl font-semibold"),
            rx.el.div(rx.foreach(Lobby.cards, track_card), data_testid="tracks", class_name="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"),
            rx.el.div(
                rx.el.div(T["keys_title"], class_name="font-semibold"),
                rx.el.p(T["keys"], class_name="mt-1 text-sm text-slate-300"),
                class_name=CARD + " mt-6",
            ),
            data_testid="lobby",
            class_name="mx-auto max-w-7xl px-4 pb-16",
        ),
        class_name="min-h-screen bg-slate-950 text-slate-100",
    )


def race_page() -> rx.Component:
    return rx.el.div(
        rx.cond(
            (Race.track_id != "") & (Race.lang != ""),
            apex_race(
                track=Race.track_id,
                backend=rx.get_upload_url(""),
                labels=Race.labels,
                lang=Race.lang,
                opponent=Race.opponent,
                on_event=Race.handle,
            ),
        ),
        data_testid="race",
        class_name="fixed inset-0 bg-slate-950",
    )
