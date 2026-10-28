"""The lobby (the ten tracks, the opponent from the AI Hub or the note that there is none, the
English switch) and a race's briefing (both views drawn, the AI studying the track), then back."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from playwright.sync_api import sync_playwright  # noqa: E402

from common import finish, launch, log, new_page, open_lobby, shot, wait_for  # noqa: E402

errors: list[str] = []
with sync_playwright() as pw:
    browser = launch(pw)
    page = new_page(browser, errors, width=1440, height=900)
    opponent = open_lobby(page)
    log("opponent:", opponent or "(none)")
    assert page.locator("h1").inner_text() == "極速對決"
    assert page.locator("[data-testid=track-card]").count() == 10
    shot(page, "01_lobby")
    page.click("[data-testid=lang]")
    wait_for(lambda: page.locator("h1").inner_text() == "Apexline", "English")
    assert page.get_by_text("Frozen Lake").count() == 1
    page.click("[data-testid=lang]")
    wait_for(lambda: page.locator("h1").inner_text() == "極速對決", "back in Chinese")

    page.click("[data-testid=race-figure_eight]")
    page.wait_for_selector("[data-testid=briefing]", timeout=90000)
    assert "八字交叉" in page.locator("[data-testid=briefing]").inner_text()
    page.wait_for_timeout(1500)
    # Both views drawn: the canvas has colour on the left half and on the right half.
    halves = page.evaluate(
        """() => { window.__apexline.render(performance.now() / 1000);  // a WebGL canvas is read in the task that drew it
        const c = document.querySelector('.ax-root canvas'); const g = document.createElement('canvas');
        g.width = 64; g.height = 32; const x = g.getContext('2d'); x.drawImage(c, 0, 0, 64, 32);
        const d = x.getImageData(0, 0, 64, 32).data; const side = (a, b) => { let s = new Set();
        for (let y = 0; y < 32; y++) for (let k = a; k < b; k++) { const i = (y * 64 + k) * 4; s.add(d[i] >> 4 << 8 | d[i+1] >> 4 << 4 | d[i+2] >> 4); } return s.size; };
        return [side(0, 32), side(32, 64)]; }"""
    )
    log("colours per half:", halves)
    assert min(halves) > 8, "both views are drawn"
    shot(page, "02_briefing")
    page.click("[data-testid=leave]")
    page.wait_for_selector("[data-testid=lobby]")
    assert page.evaluate("window.__apexline === null || window.__apexline === undefined"), "the race was taken down"
    browser.close()
finish(errors)
