"""A whole race against the AI the AI Hub sets (skipped without one), on the Sunny Oval: the AI
studies the track, the race starts with its plan, it changes the plan after its laps, the
result shows every plan next to each corner's limit, and the lobby then shows the record and
that the AI remembers the track. Your car is driven by the same autopilot (``auto``). With a
thinking model this takes several minutes."""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from playwright.sync_api import sync_playwright  # noqa: E402

from common import BASE_URL, finish, launch, log, new_page, open_lobby, shot, wait_for  # noqa: E402

STATE = """() => { const g = window.__apexline; if (!g || !g.player) return null;
  return { phase: g.phase, time: Math.round(g.time), you: g.player.lapsDone, ai: g.ai.lapsDone, plan: g.planInfo.type,
           version: g.driver.plan.version, plans: g.plans.length } }"""

errors: list[str] = []
with sync_playwright() as pw:
    browser = launch(pw)
    page = new_page(browser, errors, width=1280, height=760)
    opponent = open_lobby(page)
    if not opponent:
        log("SKIP: no AI Hub opponent here")
        raise SystemExit(0)
    log("opponent:", opponent)
    page.goto(BASE_URL + "/race/sunny_oval")
    page.wait_for_selector("[data-testid=briefing]", timeout=90000)
    started = time.time()
    page.wait_for_selector("[data-testid=start-race]", timeout=300000)
    log(f"the AI's first plan after {time.time() - started:.0f} s:", page.evaluate(STATE))
    shot(page, "1_plan_ready")
    page.click("[data-testid=start-race]")
    page.evaluate("() => { window.__apexline.auto = true; }")
    page.wait_for_timeout(8000)
    shot(page, "2_racing")
    end = time.time() + 900
    asked_again = False
    while time.time() < end:
        st = page.evaluate(STATE)
        asked_again = asked_again or (st["ai"] >= 1 and st["plan"] in ("thinking", "ready") and st["version"] >= 1)
        if st["phase"] == "over":
            break
        time.sleep(2)
    log("end:", page.evaluate(STATE))
    page.wait_for_selector("[data-testid=result]")
    text = page.locator("[data-testid=result]").inner_text()
    log("result:", text.replace("\n", " | ")[:600])
    assert "v1" in text and "極限" in text
    shot(page, "3_result")
    page.click("[data-testid=leave]")
    page.wait_for_selector("[data-testid=lobby]")
    card = page.locator("[data-testid=track-card]").first
    wait_for(lambda: "AI 記得" in card.inner_text(), "the AI remembers the oval", 30)
    log("card:", card.inner_text().replace("\n", " | "))
    shot(page, "4_lobby")
    browser.close()
finish(errors)
