# AGENTS.md

This file describes how an AI coding agent (and humans) should work in this repository.

## 0) Always read the docs first

Before making changes or running commands, **read all README.md files in this repo** and follow them.

- Repo overview & dev workflow: `README.md`
- E2E test runner conventions: `testcases/README.md`

If you already read them earlier in the session, **re-check** when unsure.

## 1) Python / Poetry requirements (strict)

This project is developed on **Python 3.15**; the range allows 3.11 too, the Python of the
re_ddns App Store image (python:3.11).

- Prefer Poetry-managed environments.
- If Poetry selected another Python, switch it:

```bash
poetry env use python3.15
poetry env info
poetry install
```

If `python3.15` is not available on PATH, use an absolute path to the 3.15 executable.

## 2) Default rule: use `poetry run` for scripts

When running any repo scripts, prefer:

- `poetry run <command>`

This ensures the correct virtualenv + dependencies are used.

## 3) Running the app: prefer `reflex_rerun.sh`

When you need to start/restart the Reflex app during development, **prefer the repo helper script**.

Typical usage:

```bash
poetry run ./reflex_rerun.sh
```

Notes:
- Prefer `poetry run ./reflex_rerun.sh` over `poetry run reflex run`.
- It runs on the expected ports: frontend `3000`, backend `8000` (it kills whatever holds them).
- Other apps on this machine may own 3000/8000. Then run on other ports and point the frontend at the backend: `REFLEX_API_URL=http://localhost:8173 poetry run reflex run --frontend-port 3173 --backend-port 8173`.
- The opponent comes from an AI Hub: outside re-ddns, point the app at one with `DDNS_AI_HUB_URL` and the same `DDNS_AUTH_SECRET` (see README, "Running it on its own").
- Set `APEXLINE_DATA_DIR` to a scratch folder when trying things, so test races don't land in your real records.

## 4) Running E2E suites: prefer `run_test_suite.sh`

E2E suites live under `testcases/<suite_name>/run_test.py`.

Do **not** run Playwright suites by starting/stopping the server manually unless you have to.
Use the repo runner, which starts/stops the Reflex server, sets `OUTPUT_DIR` and `APEXLINE_DATA_DIR`, and collects artifacts:

```bash
poetry run ./run_test_suite.sh smoke_home
```

Optional environment variables (see `testcases/README.md`): `BASE_URL`,
`FRONTEND_PORT` / `BACKEND_PORT`, `HEADLESS=0`.

Unit tests: `poetry run pytest`.

## 4.5) How Apexline is put together

- **The tracks** are drawn in `apexline/trackgen.py` (corners with radii, or smooth curves) and written once to `apexline/data/tracks/*.json` with `python -m apexline.trackgen`: centre line, heights, grip, racing line, corners with their limits, crossings. After changing a design, regenerate, then run `node tests/js/sim.mjs <id>` and the tests (a track must not overlap itself, and a plan at the limits must lap it cleanly).
- **The game runs in the browser** (`assets/apexline/`, imported by `importable_path` from `apexline/components.py`; three.js from npm). `physics.js` and `driver.js` draw nothing and are tested with Node (`tests/js/`): keep them free of three.js. A plan's quality must show in lap times: the plan at √(grip × 10 × radius) wins, far over it hits the wall and loses (tests check both).
- **The AI** is the AI Hub's role `smart` (`apexline/strategist.py`, through `reflex_ddns_auth.ai`): the game holds no model, key or hub address. It plans corner speeds and aggression; `planner.js` asks `POST /_apexline/plan` (streamed lines, heartbeats while it thinks), keeps the conversation and sends it each time; leaving the race aborts the request, which stops the model. `ai.uses` in `apexline.py` puts the game's row on the hub's page.
- **Records** (races, and the plan each model remembers per track) are in `APEXLINE_DATA_DIR` (`apexline/store.py`); the race page saves the game's `finished` event.
- Words: `apexline/i18n.py` (TEXT for the lobby, RACE handed to the game), 繁體中文 and English.
- `backend-paths.txt` sends `/_apexline/` to the backend behind re-ddns nginx (container restart after changing it).

## 4.6) The re-ddns dev-mode install

- `smart-app-apexline` bind-mounts this checkout and hot-reloads on **any** file change in it. A reload restarts the backend and cuts off a plan the AI is thinking about. Keep test output outside the checkout (`OUTPUT_DIR=...`) when testing against `https://apexline.reflex-ddns.com`.
- `pyproject.toml`, `rxconfig.py`, `poetry.lock` are copied into the container at start: changes to them need `docker restart smart-app-apexline`.
- Diagnose with `docker logs smart-app-apexline`.

## 5) Expectations when acting as an agent

- Prefer the smallest, focused change set.
- After code changes, run the closest relevant check (at minimum the related suite via `run_test_suite.sh`).
- Report outcomes: what you ran, pass/fail, and where artifacts/logs were written.

## 6) Smart way to help the Agent to debug

```
poetry run ./reflex_rerun.sh --loglevel debug
```
