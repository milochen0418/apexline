# Apexline 極速對決 🏁

A 3D race against an AI on one screen: **you on the left, the AI on the right**, each seen from behind its own car. The cars can knock into each other (and into the walls). **Ten tracks** to pick from, each its own place: a sunny oval, a sunset coast, mountain hairpins, a figure eight that crosses itself, city blocks, a frozen lake, desert dunes, a night circuit, rain and a long Grand Prix.

Built with [Reflex](https://reflex.dev/) and [three.js](https://threejs.org/) for the [re-ddns](https://github.com/milochen0418/re_ddns) Agentic App Store. The AI is whatever model the [AI Hub](https://github.com/milochen0418/ai_hub) sets for this app (a local Ollama model such as `qwen3.5:9b`, Claude, …): Apexline holds no model and no key.

## 🤖 How the AI drives

A language model can't steer 120 times a second (a thinking model like `qwen3.5:9b` takes a minute or two to answer), so the AI is **driver and engineer**:

1. **Before the start it studies the track.** It is told every corner (left or right, its angle, the racing line's tightest radius, the grip, the straight before it) and the car's physics in plain words (top speed 200 km/h; the most sideways grip is grip × 10 m/s²). It answers with a speed for every corner and an **aggression** from 0 (keeps well clear of you) to 3 (rams you on purpose). The briefing shows it thinking, second by second; you may start without waiting, and it then drives carefully until its plan comes.
2. **The game drives its car by that plan**: along the racing line, flat out on the straights, braking in time to reach each corner at the planned speed. A plan faster than the grip allows runs wide into the wall and loses time; a timid one loses time too. The right speed is √(grip × 10 × radius).
3. **After every lap it hears how each corner went** (its speed into it, its lowest, how far it ran off the racing line, whether it hit the wall, the gap to you and your lap time) and may change the plan for the next lap.
4. **It remembers each track**: its last plan per model is kept, and it starts from it the next time (or studies the track again if you ask).

The result shows every plan next to what the grip allowed in each corner, so you see how well the model worked it out. In the first tests `qwen3.5:9b` thought 127 s about the Sunny Oval and planned exactly the grip's limit for both turns.

## 🎮 Playing

- **↑ / W** throttle, **↓ / S / Space** brake, **← → / A D** steer, **R** back on the road, **Esc / P** pause, **M** sound, **C** camera, **Enter** start. A gamepad works too (left stick, triggers).
- Places, laps, lap times, speed, the AI's current plan (its version, how long it thought, its note and aggression) and a map are on screen. On a tall screen the two views stack.
- When one car finishes, the other has 25 s to finish too.
- The lobby shows, per track, your best time, the AI's best, your wins and losses against the model, and whether it remembers the track.

## 🛠️ How it is built

- `apexline/trackgen.py`: the ten tracks as drawings (corners with radii, or smooth curves), made into what the game drives on: the centre line every 2 m with heights, the grip (ice, sand, snow, puddles), the racing line (the line that bends least inside the road), the corners with their limits, and where the road crosses itself. Written once to `apexline/data/tracks/*.json` (`python -m apexline.trackgen`).
- `assets/apexline/`: the game in the browser. `physics.js` (the car: grip-limited turning, scrubbing and running wide, walls, knocks between the cars, laps), `driver.js` (the AI's driving by the plan, and its lap telemetry), `scenery.js` (ground, road, kerbs, walls, the start gantry, trees, palms, towers, lamps, sea, rain, snow), `cars.js`, `hud.js`, `input.js`, `sound.js` (Web Audio engine), `planner.js` (asking for plans), `game.js` (the race: two views, countdown, finish, result).
- `apexline/strategist.py`: what the model is told (the track, then each lap) and how its plan is read; `apexline/api.py`: `GET /_apexline/track/<id>` and the streamed `POST /_apexline/plan`; `apexline/store.py`: races and remembered plans in `APEXLINE_DATA_DIR` (default `~/.local/share/apexline`).

## 🚀 Running it

**On re-ddns:** install *Apexline* from the App Store (with the AI Hub). Pick the model for `apexline` on the AI Hub's page (*What each app's AI uses*) and open `https://apexline.reflex-ddns.com`.

**Running it on its own** (for development) needs an AI Hub to ask (without one the AI only drives carefully):

```bash
poetry env use python3.15
poetry install
DDNS_AI_HUB_URL=http://127.0.0.1:8172 DDNS_AUTH_SECRET=<the hub's secret> SERVICE_SUBDOMAIN=apexline \
  APEXLINE_DATA_DIR=/tmp/apexline REFLEX_API_URL=http://localhost:8174 \
  poetry run reflex run --frontend-port 3174 --backend-port 8174
```

## 🧪 Tests

```bash
poetry run pytest                      # the tracks, the prompts and plans, the records
node --test tests/js/physics.test.mjs  # the car, the AI's driving: the right plan wins, too fast hits the wall
node tests/js/sim.mjs city,ice_lake    # lap times for plans from 60% to 150% of the limits
poetry run ./run_test_suite.sh smoke_home
DDNS_AI_HUB_URL=… DDNS_AUTH_SECRET=… SERVICE_SUBDOMAIN=apexline poetry run ./run_test_suite.sh race_ai
```

See [testcases/README.md](testcases/README.md).

## License

MIT
