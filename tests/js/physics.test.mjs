// node tests/js/physics.test.mjs: the car, the AI's driving and the plan's effect on lap times.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Car, STEP, collide } from "../../assets/apexline/physics.js";
import { Driver, cautiousPlan } from "../../assets/apexline/driver.js";
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
  for (const id of TRACKS.filter((t) => t !== "sunny_oval")) {
    const track = loadTrack(id);
    const right = drive(track, 1.05);
    const wild = drive(track, 1.5);
    assert.ok(wild.walls >= 3, `${id}: ${wild.walls} knocks`);
    assert.ok(wild.t > right.t * 1.03, `${id}: ${wild.t.toFixed(1)} vs ${right.t.toFixed(1)}`);
  }
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
