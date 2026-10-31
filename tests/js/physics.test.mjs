// node tests/js/physics.test.mjs: the car, the AI's driving and the plan's effect on lap times.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Car, STEP, collide } from "../../assets/apexline/physics.js";
import { Driver, LEVELS, cautiousPlan, cornerLimit, gripPlan } from "../../assets/apexline/driver.js";
import { CARS, carSpec, carStats } from "../../assets/apexline/garage.js";
import { drive, loadTrack } from "./sim.mjs";

const TRACKS = ["sunny_oval", "coast", "hairpin_pass", "figure_eight", "city", "ice_lake", "desert", "night", "rain", "grand_prix"];

test("a plan at the grip's limit laps every track cleanly, and beats a timid one", () => {
  for (const id of TRACKS) {
    const track = loadTrack(id);
    const right = drive(track, 1.0);
    const timid = drive(track, 0.8);
    assert.equal(right.lapTimes.length, 2, id);
    assert.ok(right.walls <= 1, `${id}: ${right.walls} knocks`);
    assert.ok(right.t < timid.t * 0.95, `${id}: ${right.t.toFixed(1)} vs timid ${timid.t.toFixed(1)}`);
  }
});

test("a plan far over the limit hits the wall and loses time (the oval is wide enough to forgive it)", () => {
  let wildTotal = 0;
  let rightTotal = 0;
  for (const id of TRACKS.filter((t) => t !== "sunny_oval")) {
    const track = loadTrack(id);
    const right = drive(track, 1.05);
    const wild = drive(track, 1.5);
    assert.ok(wild.walls >= 3, `${id}: ${wild.walls} knocks`);
    assert.ok(wild.t > right.t, `${id}: ${wild.t.toFixed(1)} vs ${right.t.toFixed(1)}`);
    wildTotal += wild.t;
    rightTotal += right.t;
  }
  assert.ok(wildTotal > rightTotal * 1.04, `${wildTotal.toFixed(1)} vs ${rightTotal.toFixed(1)}`);
});

test("the telemetry says which corners slid and hit the wall", () => {
  const track = loadTrack("city");
  const wild = drive(track, 1.5, 1);
  const report = wild.reports[0];
  assert.equal(report.corners.length, track.corners.length);
  assert.ok(report.corners.some((c) => c.slid && c.wide > 2.5));
  assert.ok(report.corners.some((c) => c.wall));
  assert.ok(report.corners.every((c) => c.entry !== null && c.plan > 0));
  const calm = drive(track, 0.8, 1).reports[0];
  assert.ok(calm.corners.every((c) => !c.wall && c.wide < 2.5), JSON.stringify(calm.corners.map((c) => c.wide)));
});

test("laps count once per crossing of the line", () => {
  const track = loadTrack("sunny_oval");
  const r = drive(track, 1.0, 3);
  assert.equal(r.lapTimes.length, 3);
  assert.ok(r.lapTimes[1] < r.lapTimes[0], "a flying lap is quicker than the standing start");
});

test("two cars that touch push apart and trade speed", () => {
  const track = loadTrack("sunny_oval");
  const a = new Car(track, "a");
  const b = new Car(track, "b");
  a.reset(10, 0);
  b.reset(10, 1.2);
  a.u = 20;
  b.u = 10;
  b.v = -4; // swerving right, into a
  const push = collide(a, b);
  assert.ok(push > 0);
  assert.ok(a.v < 0, "a is shoved right");
  const gap = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(gap > 1.2, `apart: ${gap}`);
  assert.equal(a.bumps, 1);
  // From behind: the car in front is pushed on.
  const c = new Car(track, "c");
  const d = new Car(track, "d");
  c.reset(30, 0);
  d.reset(31, 0);
  c.u = 30;
  d.u = 10;
  collide(c, d);
  assert.ok(d.u > 10 && c.u < 30);
});

test("two AIs race the figure eight, the rough one aiming at the other, and both finish", () => {
  const track = loadTrack("figure_eight");
  const cars = [new Car(track, "calm"), new Car(track, "rough")];
  cars[0].reset(0, 2.5, 4);
  cars[1].reset(0, -2.5, 4);
  const drivers = cars.map((c) => new Driver(c));
  drivers[0].setPlan({ ...cautiousPlan(track), aggression: 0 });
  drivers[1].setPlan({ ...cautiousPlan(track), aggression: 3 });
  let t = 0;
  let bumps = 0;
  while ((cars[0].lapsDone < 2 || cars[1].lapsDone < 2) && t < 400) {
    const inputs = drivers.map((d, k) => d.control(cars[1 - k]));
    cars.forEach((c, k) => c.step(inputs[k], STEP));
    if (collide(cars[0], cars[1]) > 0.5) bumps++;
    t += STEP;
  }
  for (const c of cars) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.u), c.name);
    assert.ok(c.lapsDone >= 2, `${c.name} finished (${c.lapsDone} laps in ${t.toFixed(0)} s)`);
  }
  assert.ok(bumps > 0, "the rough driver made contact");
});

test("a clean racer close behind a slower car slows down instead of running into it", () => {
  const track = loadTrack("sunny_oval");
  const lead = new Car(track, "lead");
  const chaser = new Car(track, "chaser");
  lead.reset(60, 0);
  chaser.reset(54, 0);
  lead.u = 15;
  chaser.u = 30;
  const d = new Driver(chaser);
  d.setPlan({ ...cautiousPlan(track), aggression: 1 });
  let bumps = 0;
  for (let k = 0; k < 240; k++) {
    chaser.step(d.control(lead), STEP);
    lead.step({ throttle: 0.2, brake: 0, steer: 0 }, STEP);
    if (collide(chaser, lead) > 0.5) bumps++;
  }
  assert.equal(bumps, 0);
  const rammer = new Driver(chaser);
  rammer.setPlan({ ...cautiousPlan(track), aggression: 3 });
  lead.reset(60, 0);
  chaser.reset(54, 0);
  lead.u = 15;
  chaser.u = 30;
  let rams = 0;
  for (let k = 0; k < 240; k++) {
    chaser.step(rammer.control(lead), STEP);
    lead.step({ throttle: 0.2, brake: 0, steer: 0 }, STEP);
    if (collide(chaser, lead) > 0.5) rams++;
  }
  assert.ok(rams > 0, "aggression 3 rams");
});

// Up and the corner's way held from where it really bends to where it stops, entering at `share`
// of its limit on the racing line.
function holdCorner(track, corner, share, spec = track.car) {
  const span = track.wrap(corner.to - corner.from);
  const bends = Array.from({ length: span + 1 }, (_, k) => Math.abs(track.lineBend[track.wrap(corner.from + k)]));
  const peak = Math.max(...bends);
  const from = bends.findIndex((b) => b >= 0.5 * peak);
  const to = span - [...bends].reverse().findIndex((b) => b >= 0.5 * peak);
  const i = track.wrap(corner.from + from);
  const car = new Car(track, "you", spec);
  car.reset(i, track.line[i]);
  const [ax, az] = track.point(i, track.line[i]);
  const [bx, bz] = track.point(i + 1, track.line[track.wrap(i + 1)]);
  car.yaw = Math.atan2(bz - az, bx - ax);
  car.progress = 0;
  car.u = (corner.limit_kmh * share) / 3.6;
  const start = car.u;
  const side = corner.dir === "L" ? 1 : -1;
  let steer = 0;
  let wall = 0;
  for (let t = 0; t < 20 && car.progress < to - from; t += STEP) {
    steer = Math.max(-1, Math.min(1, steer + side * 5 * STEP));
    car.step(car.assist({ throttle: 1, brake: 0, steer }), STEP);
    for (const e of car.events) if (e.type === "wall") wall = Math.sign(car.d) === side ? 1 : -1;
    car.events.length = 0;
  }
  return { gained: car.u - start, wall };
}

test("up and a steering key held go round a corner: gaining speed, never into the inside wall", () => {
  let gained = 0;
  let corners = 0;
  let outside = 0;
  for (const id of TRACKS) {
    const track = loadTrack(id);
    for (const corner of track.corners) {
      const held = holdCorner(track, corner, 0.8);
      assert.notEqual(held.wall, 1, `${id} ${corner.id}: into the inside wall`);
      gained += held.gained;
      corners += 1;
      if (held.wall) outside += 1;
    }
  }
  assert.ok(gained / corners > 2, `${(gained / corners).toFixed(1)} m/s on average`);
  assert.ok(outside / corners < 0.15, `${outside} of ${corners} ran wide`);
});

test("a touch of the wall costs little and a real hit a lot, and neither stops the car dead", () => {
  const track = loadTrack("sunny_oval");
  let i = 0;
  let run = 0;
  for (let k = 0; k < track.n * 2 && run < 30; k++) {
    run = Math.abs(track.lineBend[k % track.n]) < 1e-4 ? run + 1 : 0;
    i = k % track.n;
  }
  const after = (degrees) => {
    const car = new Car(track, "x");
    car.reset(i - 20, track.hw + track.shoulder - track.car.width / 2 - 0.05);
    car.yaw -= (degrees * Math.PI) / 180; // towards the left wall
    car.u = 33.3;
    for (let k = 0; k < 60; k++) car.step({ throttle: 1, brake: 0, steer: 0 }, STEP);
    return car.speedKmh;
  };
  assert.ok(after(1) > 105, `1°: ${after(1)}`);
  assert.ok(after(5) > 90, `5°: ${after(5)}`);
  assert.ok(after(30) < 70 && after(30) > 15, `30°: ${after(30)}`);
});

test("a keyboard full key follows the road: gentle on a straight, the grip's limit in a hairpin", () => {
  const track = loadTrack("hairpin_pass");
  const asked = (i, kmh, help = true) => {
    const car = new Car(track, "you");
    car.reset(i, 0);
    car.u = kmh / 3.6;
    const wheel = car.assist({ throttle: 0, brake: 0, steer: 1 }, help).steer * car.maxSteer();
    return (car.u * car.u * Math.tan(wheel)) / car.spec.wheelbase; // m/s² sideways
  };
  const straight = track.roadBend.findIndex((b, i) => Math.abs(b) < 1e-4 && Math.abs(track.roadBend[track.wrap(i + 30)]) < 1e-4);
  assert.ok(asked(straight, 80) < 7, `straight: ${asked(straight, 80)}`);
  assert.ok(Math.abs(asked(straight, 80, false) - track.car.lat) < 1, "without help a full key is the limit");
  const c = track.corners.find((x) => x.dir === "L");
  assert.ok(asked(track.wrap(c.from + 8), 70) > 0.9 * track.car.lat, `hairpin: ${asked(track.wrap(c.from + 8), 70)}`);
});

test("too fast into a corner the nose still turns in, and the slide takes speed off", () => {
  const track = loadTrack("sunny_oval");
  const car = new Car(track, "x");
  car.place = () => {}; // open ground
  car.watch = () => {};
  car.u = 40;
  let most = 0;
  for (let k = 0; k < 180; k++) {
    car.step({ throttle: 0, brake: 0, steer: 1 }, STEP);
    most = Math.max(most, Math.abs(car.slip));
  }
  assert.ok(most > 0.1 && most < car.spec.slide * 1.2, `slide ${most}`);
  assert.ok(Math.hypot(car.u, car.v) < 37, "the tyres took speed off");
});

test("every car laps cleanly at its own limits, and no car is best everywhere", () => {
  const best = new Set();
  const totals = {};
  for (const id of TRACKS) {
    const track = loadTrack(id);
    const times = Object.keys(CARS).map((name) => {
      const spec = carSpec(name, track.car);
      const car = new Car(track, name, spec);
      car.reset(0, 0, 4);
      const d = new Driver(car);
      d.setPlan(gripPlan(track, 1, spec));
      let t = 0;
      while (car.lapsDone < 1 && t < 300) {
        car.step(d.control(null), STEP);
        t += STEP;
      }
      assert.ok(car.wallHits <= 1, `${id} ${name}: ${car.wallHits} knocks`);
      totals[name] = (totals[name] || 0) + t;
      return [t, name];
    });
    best.add(times.sort((a, b) => a[0] - b[0])[0][1]);
  }
  assert.ok(best.size >= 3, `best somewhere: ${[...best]}`);
  const all = Object.values(totals);
  assert.ok(Math.max(...all) < Math.min(...all) * 1.03, JSON.stringify(totals));
  const stats = carStats(loadTrack("city").car);
  assert.equal(stats.hornet.grip, 1);
  assert.equal(stats.bison.top, 1);
});

test("the AI drives whichever car it is given, by that car's own limits", () => {
  const track = loadTrack("city");
  const spec = carSpec("bison", track.car);
  const lap = (plan) => {
    const car = new Car(track, "ai", spec);
    car.reset(0, 0, 4);
    const d = new Driver(car);
    d.setPlan(plan);
    let t = 0;
    while (car.lapsDone < 1 && t < 300) {
      car.step(d.control(null), STEP);
      t += STEP;
    }
    return { t, walls: car.wallHits };
  };
  const c = track.corners[0];
  assert.equal(cornerLimit(track, c, spec), c.limit_kmh * Math.sqrt(spec.lat / track.car.lat));
  assert.equal(new Driver(new Car(track, "ai", spec)).plan.speeds[c.id], Math.round(cornerLimit(track, c, spec) * 0.7));
  const own = lap(gripPlan(track, 1, spec));
  const lighter = lap(gripPlan(track, 1.12, carSpec("hornet", track.car)));
  assert.ok(own.walls <= 1, `its own plan: ${own.walls} knocks`);
  assert.ok(lighter.walls > own.walls, `a plan for a grippier car: ${lighter.walls} knocks`);
});

test("each difficulty level is slower than the next and keeps the model's plan as it is", () => {
  const track = loadTrack("city");
  const plan = { speeds: Object.fromEntries(track.corners.map((c) => [c.id, c.limit_kmh])), aggression: 3 };
  const times = Object.values(LEVELS).map((level) => {
    const car = new Car(track, "ai");
    car.reset(0, 0, 4);
    const d = new Driver(car);
    d.setPlan(plan);
    d.setLevel(level);
    assert.equal(d.plan, plan);
    let t = 0;
    while (car.lapsDone < 1 && t < 400) {
      car.step(d.control(null), STEP);
      t += STEP;
    }
    return t;
  });
  for (let k = 1; k < times.length; k++) assert.ok(times[k] < times[k - 1], times.join(" "));
  const easy = new Driver(new Car(track, "ai"));
  easy.setPlan(plan);
  easy.setLevel(LEVELS.easy);
  assert.equal(easy.aggression(), 0);
});
