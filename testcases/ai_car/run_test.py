"""You pick the AI's car: the picker's pictures are drawn, the AI's car changes its numbers and stays
picked, every question to the hub says which car the AI drives, the result reads each corner's limit
for that car and the record keeps it, and a new car at the result means a new plan first."""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from playwright.sync_api import sync_playwright  # noqa: E402

from common import finish, launch, log, new_page, open_lobby, shot, wait_for  # noqa: E402

errors: list[str] = []
asked: list[dict] = []


def on_request(request) -> None:  # noqa: ANN001
    if request.url.endswith("/_apexline/plan"):
        asked.append(json.loads(request.post_data or "{}"))


with sync_playwright() as pw:
    browser = launch(pw)
    page = new_page(browser, errors, width=1440, height=900)
    page.on("request", on_request)
    open_lobby(page)
    page.click("[data-testid=race-sunny_oval]")
    page.wait_for_selector("[data-testid=briefing]", timeout=90000)
    wait_for(lambda: asked, "the first question")
    assert asked[0]["car"]["id"] == "gt" and asked[0]["car"]["top"] == 200 and asked[0]["car"]["lat"] == 18
    wait_for(lambda: page.evaluate("[...document.querySelectorAll('.ax-thumb img')].filter(i => i.naturalWidth > 0).length") == 8, "the cars' pictures", 30)
    shot(page, "01_picker")

    page.click("[data-testid=ai-car-bison]")
    wait_for(lambda: page.evaluate("window.__apexline.aiCarName") == "bison", "the AI's car")
    assert page.evaluate("window.__apexline.ai.spec.vmax > window.__apexline.player.spec.vmax"), "the AI's car has its own numbers"
    assert page.evaluate("window.__apexline.ai.spec.lat < window.__apexline.player.spec.lat")
    assert page.evaluate("localStorage.getItem('apexline.aicar')") == "bison"
    assert page.locator("[data-testid=ai-car-bison].ax-on").count() == 1
    assert page.locator("[data-testid=car-gt].ax-on").count() == 1, "your car stays"
    wait_for(lambda: asked[-1]["car"]["id"] == "bison", "a question about the new car")
    car = asked[-1]["car"]
    assert car["top"] == 220 and car["lat"] == 16 and car["brake"] == 12 and car["name"], car
    page.click("[data-testid=car-hornet]")
    wait_for(lambda: page.evaluate("window.__apexline.carName") == "hornet", "your car")
    assert page.evaluate("window.__apexline.aiCarName") == "bison", "the AI's car stays"
    shot(page, "02_picked")

    # A plan as it comes from the hub, then the race run in a moment.
    page.evaluate("window.__apexline.planState({ type: 'plan', plan: { speeds: { C1: 120, C2: 120 }, aggression: 1 }, model: 'test', secs: 1, lap: 0 })")
    page.locator("[data-testid=start-race], [data-testid=start-now]").first.click()
    wait_for(lambda: page.evaluate("window.__apexline.phase") == "racing", "racing", timeout=10)
    page.wait_for_timeout(1500)
    shot(page, "03_racing")
    page.evaluate(
        """() => { const g = window.__apexline; g.auto = true; g.planner.ask = async () => null;
        for (let k = 0; k < 120 * 400 && g.phase === 'racing'; k++) g.physics(performance.now());
        delete g.planner.ask; }"""
    )
    page.wait_for_selector("[data-testid=result]", timeout=15000)
    shot(page, "04_result")
    text = page.locator("[data-testid=result]").inner_text()
    assert "蜂鳥" in text and "野牛" in text, text
    shown = page.evaluate("[...document.querySelectorAll('.ax-plans tbody tr td:nth-child(2)')].map(c => Number(c.textContent))")
    limits = page.evaluate("window.__apexline.pack.corners.map(c => Math.round(c.limit_kmh * Math.sqrt(16.02 / 18)))")
    log("limits for the Bison:", shown, limits)
    assert shown == limits, "the limits are the AI's car's"
    data = Path(os.environ.get("APEXLINE_DATA_DIR", ""))
    if (data / "races.jsonl").exists():
        wait_for(lambda: "bison" in (data / "races.jsonl").read_text(), "the record", 5)
        race = json.loads((data / "races.jsonl").read_text().splitlines()[-1])
        assert race["car"] == "hornet" and race["ai_car"] == "bison", race
        assert any(k.endswith("|bison") for k in json.loads((data / "memory.json").read_text())), "a plan kept for this car"

    # Another car for the next race: the AI studies the track again first.
    before = len(asked)
    page.click("[data-testid=ai-car-fox]")
    page.click("[data-testid=again]")
    page.wait_for_selector("[data-testid=briefing]", timeout=10000)
    wait_for(lambda: len(asked) > before and asked[-1]["car"]["id"] == "fox", "a question about the fox")
    assert page.evaluate("window.__apexline.phase") == "briefing"
    assert page.evaluate("window.__apexline.driver.plan.version") == 0, "no plan until it comes"

    page.reload()
    page.wait_for_selector("[data-testid=briefing]", timeout=90000)
    assert page.evaluate("window.__apexline.aiCarName") == "fox", "stays picked"
    browser.close()
finish(errors)
