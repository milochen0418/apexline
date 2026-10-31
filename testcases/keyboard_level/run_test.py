"""Real key presses: the car picker changes the car, the difficulty picker sets the AI's pace, and
both stay picked; up and a steering key held take the car round the oval's bend, keeping its speed
and without touching a wall; L hides the driving line; the race then runs to the result, which
names the car."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from playwright.sync_api import sync_playwright  # noqa: E402

from common import finish, launch, log, new_page, open_lobby, shot, wait_for  # noqa: E402

errors: list[str] = []
with sync_playwright() as pw:
    browser = launch(pw)
    # A small window: this suite waits on the clock, and headless Chromium draws in software.
    page = new_page(browser, errors, width=900, height=640)
    open_lobby(page)
    page.click("[data-testid=race-sunny_oval]")
    page.wait_for_selector("[data-testid=briefing]", timeout=90000)
    page.click("[data-testid=level-hard]")
    wait_for(lambda: page.evaluate("window.__apexline.driver.level.pace") == 0.92, "hard level")
    assert page.evaluate("localStorage.getItem('apexline.level')") == "hard"
    # A plan as it comes from the hub: kept as it is, driven at the level's pace and aggression.
    page.evaluate("window.__apexline.planState({ type: 'plan', plan: { speeds: { C1: 150, C2: 150 }, aggression: 3 }, model: 'test', secs: 1, lap: 0 })")
    assert page.evaluate("(d => [d.plan.aggression, d.aggression()])(window.__apexline.driver)") == [3, 2]
    page.click("[data-testid=car-hornet]")
    wait_for(lambda: page.evaluate("window.__apexline.carName") == "hornet", "hornet")
    assert page.evaluate("window.__apexline.player.spec.lat > window.__apexline.ai.spec.lat"), "the car's own grip"
    assert page.evaluate("localStorage.getItem('apexline.car')") == "hornet"
    assert page.locator("[data-testid=car-hornet].ax-on").count() == 1
    shot(page, "01_pickers")
    page.locator("[data-testid=start-race], [data-testid=start-now]").first.click()
    wait_for(lambda: page.evaluate("window.__apexline.phase") == "racing", "racing", timeout=10)
    page.evaluate("window.__apexline.driver.control = () => ({ throttle: 0, brake: 1, steer: 0 })")  # out of the way
    page.keyboard.down("ArrowUp")
    wait_for(lambda: page.evaluate("window.__apexline.player.u") > 25, "up to speed", timeout=15)
    # Drive the oval's first bend: wait for it, then hold up and right to its end.
    wait_for(lambda: page.evaluate("(g => g.track.roadBend[(g.player.i + 20) % g.track.n])(window.__apexline)") < -0.003, "the bend", timeout=20)
    knocks = page.evaluate("window.__apexline.player.wallHits")
    page.keyboard.down("ArrowRight")
    samples = []
    for _ in range(30):
        page.wait_for_timeout(120)
        samples.append(page.evaluate("(g => [g.player.speedKmh, g.player.d, g.player.input.steer])(window.__apexline)"))
        if len(samples) == 14:
            shot(page, "02_turning")
    page.keyboard.up("ArrowRight")
    log("speed, across the road, wheel:", samples[::6])
    assert samples[-1][0] > samples[0][0] - 3, "kept its speed or gained"
    assert max(abs(s[2]) for s in samples) > 0.02, "the steering reached the car"
    assert page.evaluate("window.__apexline.player.wallHits") == knocks, "no wall"
    page.keyboard.up("ArrowUp")
    assert page.evaluate("window.__apexline.lineOn") is True
    page.keyboard.press("l")
    wait_for(lambda: page.evaluate("window.__apexline.lineOn") is False, "line hidden", timeout=3)
    page.keyboard.press("l")
    # The rest of the race, run in a moment.
    page.evaluate(
        """() => { const g = window.__apexline; delete g.driver.control; g.auto = true;
        for (let k = 0; k < 120 * 400 && g.phase === 'racing'; k++) g.physics(performance.now()); }"""
    )
    page.wait_for_selector("[data-testid=result]", timeout=15000)
    assert "蜂鳥" in page.locator("[data-testid=result] .ax-sub").inner_text()
    assert page.locator("[data-testid=car-bison]").count() == 1
    shot(page, "03_result")
    page.click("[data-testid=car-bison]")
    assert page.evaluate("window.__apexline.player.spec.vmax > window.__apexline.ai.spec.vmax"), "the car changes for the next race"
    page.click("[data-testid=again]")
    wait_for(lambda: page.evaluate("window.__apexline.phase") in ("countdown", "racing"), "again", timeout=5)
    browser.close()
finish(errors)
