// Drives the AI's car alone round a track with a plan at some share of each corner's limit.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Car, STEP, Track } from "../../assets/apexline/physics.js";
import { Driver, Telemetry } from "../../assets/apexline/driver.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadTrack(id) {
  return new Track(JSON.parse(readFileSync(join(ROOT, "apexline", "data", "tracks", `${id}.json`), "utf8")));
}

export function drive(track, factor, laps = 2, aggression = 1) {
  const car = new Car(track, "ai");
  car.reset(0, 0, 4);
  const driver = new Driver(car);
  const speeds = {};
  for (const c of track.corners) speeds[c.id] = Math.round(c.limit_kmh * factor);
  driver.setPlan({ speeds, aggression });
  const tele = new Telemetry(car);
  let t = 0;
  let last = 0;
  const lapTimes = [];
  const reports = [];
  while (car.lapsDone < laps && t < 900) {
    car.step(driver.control(null), STEP);
    tele.step(STEP, driver.plan);
    t += STEP;
    for (const e of car.events) {
      if (e.type === "wall") tele.wall();
      if (e.type === "lap") {
        lapTimes.push(t - last);
        last = t;
        reports.push(tele.lap(e.laps));
      }
    }
    car.events.length = 0;
  }
  return { t, lapTimes, walls: car.wallHits, reports };
}

if (process.argv[2]) {
  const ids = process.argv[2].split(",");
  for (const id of ids) {
    const track = loadTrack(id);
    const row = [];
    for (const f of [0.6, 0.8, 0.95, 1.05, 1.2, 1.5]) {
      const r = drive(track, f);
      row.push(`${f}: ${r.lapTimes.map((x) => x.toFixed(1)).join("/")}s w${r.walls}`);
    }
    console.log(id.padEnd(13), row.join(" | "));
  }
}
