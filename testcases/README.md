# E2E testcases

Playwright end-to-end suites, one per folder:

- `testcases/<suite_name>/run_test.py`
- `testcases/<suite_name>/output/` (screenshots and logs, ignored by git)

Each `run_test.py` exits `0` on success and non-zero on failure, and writes its screenshots into
`OUTPUT_DIR` (provided by the runner). Shared helpers are in `common.py`. The runner points
`APEXLINE_DATA_DIR` at a fresh folder in `OUTPUT_DIR`, so the races a suite drives don't land in
your records. `window.__apexline` is the game; setting its `auto` lets the AI's driving drive your
car too.

## Suites

| Suite | What it checks |
|-------|----------------|
| `smoke_home` | The lobby: ten tracks, the opponent from the AI Hub (or the note that there is none), the English switch; a race's briefing with both views drawn; back to the lobby, the race taken down. |
| `keyboard_level` | Real key presses: the car and difficulty pickers work and are remembered; up and a steering key held take the car round a bend, keeping its speed, with no wall; L hides the driving line; the race runs to the result. |
| `ai_car` | The picker's two sides: the cars' pictures are drawn; the AI's car changes its numbers and is remembered; each question to the hub says which car the AI drives; the result reads each corner's limit for that car and the record keeps it; a new car at the result means a new plan before the next race. |
| `race_ai` | (Needs an AI Hub; skipped without one.) A whole race on the Sunny Oval against the hub's model: the AI's first plan, the race with your car on autopilot, the AI changing its plan after its laps, the result with every plan next to the limits, and the lobby showing the record and that the AI remembers the track. Several minutes with a thinking model. |

## Running

```bash
poetry run ./run_test_suite.sh smoke_home
DDNS_AI_HUB_URL=http://127.0.0.1:8172 DDNS_AUTH_SECRET=<the hub's secret> SERVICE_SUBDOMAIN=apexline \
  poetry run ./run_test_suite.sh race_ai
```

If ports 3000/8000 belong to another app, use others: `FRONTEND_PORT=3174 BACKEND_PORT=8174`.

To test a deployed instance (e.g. behind re-ddns), run a script directly:

```bash
BASE_URL=https://apexline.reflex-ddns.com OUTPUT_DIR=/tmp/apexline-e2e \
  poetry run python testcases/smoke_home/run_test.py
```

Keep `OUTPUT_DIR` outside the repo when the target is a re-ddns **dev-mode** install of this
checkout: that container watches the mounted source, so a file written under `testcases/`
restarts its backend, which cuts the AI's plan off mid-thought. A race driven there goes into
that install's records.

Optional env vars:
- `BASE_URL` (default `http://127.0.0.1:3000`)
- `HEADLESS=0` to watch the browser
- `PW_SLOWMO_MS=100` to slow actions down
- `PW_TIMEOUT_MS=60000` to increase Playwright timeouts

## Music (`music`)

Runs with Music Studio and Music Box beside the game: start them on their own ports and tell the game
where they are, all with one `DDNS_COLLECTIONS_ROOT`:

```bash
DDNS_INTENT_TRUST_LOCALHOST=1 DDNS_INTENT_PROVIDER_AUDIO_PICK=music-box DDNS_INTENT_PROVIDER_AUDIO_MAKE=music-studio \
  DDNS_INTENT_URL_MUSIC_BOX=http://127.0.0.1:3176 DDNS_INTENT_URL_MUSIC_STUDIO=http://127.0.0.1:3175 ...
```
