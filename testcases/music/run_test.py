"""Music in a race, with Music Studio and Music Box running beside the game (see the README for how
to point the game at them): ask the AI for a piece for this track in Music Studio's dialog, keep a
take, hear it in the race going round its loop, pick another in Music Box's dialog, and find the
song still there after a reload."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from playwright.sync_api import sync_playwright  # noqa: E402

from common import BASE_URL, finish, launch, log, new_page, shot, wait_for  # noqa: E402

errors: list[str] = []
LOUDNESS = """async () => { const g = window.__apexline; const a = g.sound.ctx.createAnalyser(); a.fftSize = 2048; g.music.gain.connect(a);
  const d = new Float32Array(2048); let top = 0;
  for (let k = 0; k < 12; k++) { await new Promise(r => setTimeout(r, 120)); a.getFloatTimeDomainData(d); top = Math.max(top, Math.max(...d.map(Math.abs))); }
  g.music.gain.disconnect(a); return top; }"""

with sync_playwright() as pw:
    browser = launch(pw)
    page = new_page(browser, errors, width=1280, height=900)
    page.goto(BASE_URL + "/race/night", wait_until="domcontentloaded")
    page.wait_for_selector("[data-testid=music]", timeout=120000)
    assert page.evaluate("window.__apexline.music.song") is None

    page.click("[data-testid=music-make]")
    frame = page.frame_locator("iframe").first
    frame.locator("[data-testid=words]").wait_for(timeout=60000)
    words = frame.locator("[data-testid=words]").input_value()
    log("asked for:", words)
    assert "夜間" in words or "night" in words.lower()
    frame.locator("[data-testid=length]").select_option("short")
    frame.locator("[data-testid=make]").click()
    frame.locator("[data-testid=take]").nth(1).wait_for(timeout=280000)
    shot(page, "01_studio_dialog")
    log("take:", frame.locator("[data-testid=take]").first.inner_text().replace("\n", " | ")[:200])
    frame.locator("[data-testid=keep]").first.click()
    wait_for(lambda: page.evaluate("window.__apexline.music.state") == "ready", "the song in the game", 60)
    song = page.evaluate("window.__apexline.music.song")
    log("the game has:", song)
    assert song["loop_end"] > song["loop_start"] > 0 and song["rights"] == "own"
    assert song["title"] in page.locator("[data-testid=music-now]").inner_text()
    wait_for(lambda: page.locator("iframe").count() == 0, "the dialog closed")
    shot(page, "02_briefing")

    page.locator("[data-testid=start-race], [data-testid=start-now]").first.click()
    wait_for(lambda: page.evaluate("window.__apexline.phase") == "racing", "racing", 20)
    page.evaluate("window.__apexline.auto = true")
    loud = page.evaluate(LOUDNESS)
    log("loudest sample in the race:", round(loud, 3))
    assert loud > 0.02, "the music can be heard"
    src = page.evaluate("(m => [m.source.loop, m.source.loopStart, m.source.loopEnd, m.buffer.duration])(window.__apexline.music)")
    log("looping:", src)
    assert src[0] and abs(src[1] - song["loop_start"]) < 1e-6 and abs(src[2] - song["loop_end"]) < 1e-6 and src[2] <= src[3]
    page.keyboard.press("Escape")
    wait_for(lambda: page.evaluate("window.__apexline.sound.ctx.state") == "suspended", "pause stops the music")
    page.keyboard.press("Escape")
    wait_for(lambda: page.evaluate("window.__apexline.sound.ctx.state") == "running", "and it goes on")
    # To the end of the race at once: the music fades.
    page.evaluate("() => { const g = window.__apexline; g.planner.ask = async () => null; for (let k = 0; k < 120 * 400 && g.phase === 'racing'; k++) g.physics(performance.now()); delete g.planner.ask; }")
    page.wait_for_selector("[data-testid=result]", timeout=20000)
    assert page.evaluate("window.__apexline.music.source") is None

    page.click("[data-testid=music-pick]")
    frame = page.frame_locator("iframe").first
    frame.locator("[data-testid=track]").first.wait_for(timeout=60000)
    count = frame.locator("[data-testid=track]").count()
    log("songs to pick from:", count)
    shot(page, "03_box_dialog")
    pick = frame.locator("[data-testid=track]").filter(has_text="YouTube").first
    frame.locator("[data-testid=track]", has_text="YouTube").locator("[data-testid=choose]").first.click()
    wait_for(lambda: "YouTube" in page.evaluate("(window.__apexline.music.song || {}).title || ''"), "the picked song", 30)
    wait_for(lambda: page.evaluate("window.__apexline.music.state") == "ready", "read", 30)
    assert page.evaluate("window.__apexline.music.song.rights") == "third-party"

    page.reload()
    page.wait_for_selector("[data-testid=music]", timeout=120000)
    wait_for(lambda: page.evaluate("window.__apexline.music.state") == "ready", "still there after a reload", 30)
    page.click("[data-testid=music-off]")
    wait_for(lambda: page.evaluate("window.__apexline.music.song") is None, "turned off")
    assert page.evaluate("localStorage.getItem('apexline.music.night')") == "off"
    browser.close()
finish(errors)
