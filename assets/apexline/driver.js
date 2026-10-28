// The AI's car is driven by this, by the plan the AI Hub's model made (apexline/strategist.py):
// a speed for every corner (km/h) and how hard to race the other car (aggression 0..3). The
// model can't steer 120 times a second; it decides how, and this does it: follows the racing
// line, brakes in time to reach each corner at the planned speed, holds it through the corner
// and floors it on the straights. A plan faster than the grip allows runs wide into the wall.
//
// It also notes how each corner went in each lap (Telemetry), which goes back to the model so
// it can change the plan for the next lap.

import { clamp } from "./physics.js";

// Before the model has answered: every corner at 70% of what the grip allows.
export function cautiousPlan(track) {
  const speeds = {};
  for (const c of track.corners) speeds[c.id] = Math.round(c.limit_kmh * 0.7);
  return { speeds, aggression: 1, note: "", version: 0 };
}

export class Driver {
  constructor(car) {
    this.car = car;
    this.track = car.track;
    this.target = new Float64Array(this.track.n);
    this.setPlan(cautiousPlan(this.track));
  }

  setPlan(plan) {
    this.plan = plan;
    const tr = this.track;
    const n = tr.n;
    // The straights and gentle bends drive themselves, as fast as the grip allows; the plan
    // is for the corners.
    const caps = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const bend = Math.abs(tr.lineBend[i]);
      caps[i] = bend > 1e-5 ? Math.min(tr.car.vmax, 0.96 * Math.sqrt((tr.car.lat * tr.grip[i]) / bend)) : tr.car.vmax;
    }
    for (const c of tr.corners) {
      const kmh = Number(plan.speeds && plan.speeds[c.id]);
      const v = clamp((Number.isFinite(kmh) && kmh > 0 ? kmh : c.limit_kmh * 0.7) / 3.6, 3, tr.car.vmax);
      for (let i = c.from; ; i = (i + 1) % n) {
        caps[i] = v;
        if (i === c.to) break;
      }
    }
    // Brake in time: from each corner back, the fastest a car can go and still slow down for it.
    for (let pass = 0; pass < 2; pass++) {
      for (let k = n - 1; k >= 0; k--) {
        const next = caps[(k + 1) % n];
        const brake = tr.car.brake * tr.grip[k] * 0.85;
        caps[k] = Math.min(caps[k], Math.sqrt(next * next + 2 * brake * tr.ds));
      }
    }
    this.target = caps;
  }

  // Throttle, brake and steering for this moment; `rival` is the other car.
  control(rival) {
    const car = this.car;
    const tr = this.track;
    const look = clamp(5 + 0.45 * Math.abs(car.u), 6, 28);
    const ahead = tr.wrap(car.i + Math.round(look / tr.ds));
    let off = tr.line[ahead];
    if (rival) off = this.race(rival, off, ahead);
    off = clamp(off, -tr.hw + 1.2, tr.hw - 1.2);
    const [px, pz] = tr.point(ahead, off);
    const hx = Math.cos(car.yaw);
    const hz = Math.sin(car.yaw);
    const dx = px - car.x;
    const dz = pz - car.z;
    const fwd = dx * hx + dz * hz;
    const left = dx * hz - dz * hx;
    const bend = (2 * left) / Math.max(fwd * fwd + left * left, 1);
    const steer = clamp(Math.atan(bend * tr.car.wheelbase) / car.maxSteer(), -1, 1);
    let want = Math.min(this.target[car.i], this.target[tr.wrap(car.i + 2)]);
    if (rival && (this.plan.aggression ?? 1) < 3) want = Math.min(want, this.behind(rival));
    if (car.u < want - 0.4) return { throttle: 1, brake: 0, steer };
    if (car.u > want + 0.6) return { throttle: 0, brake: clamp((car.u - want) / 4, 0.3, 1), steer };
    return { throttle: 0.35, brake: 0, steer };
  }

  // Not running into the back of a slower car just ahead in the same lane (aggression 3 does).
  behind(rival) {
    const tr = this.track;
    let gap = rival.i - this.car.i;
    if (gap > tr.n / 2) gap -= tr.n;
    if (gap < -tr.n / 2) gap += tr.n;
    const metres = gap * tr.ds;
    if (metres <= 0 || metres > 16 || Math.abs(rival.d - this.car.d) > 2.4) return Infinity;
    return Math.max(0, rival.u - 1 + (metres - 7) * 0.4);
  }

  // Where to be across the road with the other car near: by the plan's aggression, 0 keeps
  // well clear, 1 races clean (passes on the roomier side), 2 also blocks a car close behind,
  // 3 also aims at the car ahead or beside.
  race(rival, off, ahead) {
    const tr = this.track;
    const level = this.plan.aggression ?? 1;
    let gap = rival.i - this.car.i;
    if (gap > tr.n / 2) gap -= tr.n;
    if (gap < -tr.n / 2) gap += tr.n;
    const metres = gap * tr.ds;
    const theirs = rival.d;
    if (metres > -6 && metres < 30) {
      if (level >= 3) return theirs;
      const clear = level === 0 ? 4.2 : 3.2;
      if (Math.abs(theirs - off) < clear) return theirs > 0 ? theirs - clear : theirs + clear;
      return off;
    }
    if (level >= 2 && metres <= -6 && metres > -25) return off + (theirs - off) * 0.6;
    return off;
  }
}

const WIDE = 2.5; // metres off the racing line that count as sliding wide

// How each corner went, lap by lap, for the model.
export class Telemetry {
  constructor(car) {
    this.car = car;
    this.track = car.track;
    this.laps = [];
    this.start();
  }

  start() {
    this.current = this.track.corners.map((c) => ({ id: c.id, entry: null, min: null, wide: 0, slid: false, wall: false, secs: 0 }));
    this.lapTime = 0;
    this.bumps = 0;
  }

  // Every physics step; `plan` is the plan driving now.
  step(dt, plan) {
    const car = this.car;
    this.lapTime += dt;
    const k = this.track.cornerAt[car.i];
    if (k < 0) return;
    const c = this.current[k];
    const kmh = Math.max(0, car.u * 3.6);
    if (c.entry === null) {
      c.entry = Math.round(kmh);
      c.plan = plan && plan.speeds ? Number(plan.speeds[c.id]) || null : null;
    }
    c.min = c.min === null ? Math.round(kmh) : Math.min(c.min, Math.round(kmh));
    // How far off the racing line it went: a metre or two at the grip's limit, many more over it.
    c.wide = Math.max(c.wide, Math.round(Math.abs(car.d - this.track.line[car.i]) * 10) / 10);
    c.slid = c.wide > WIDE;
    c.secs += dt;
  }

  wall() {
    const k = this.track.cornerAt[this.car.i];
    if (k >= 0) this.current[k].wall = true;
  }

  // The lap just finished: its record, and a fresh one begins.
  lap(number) {
    const done = { lap: number, secs: this.lapTime, corners: this.current, bumps: this.bumps };
    this.laps.push(done);
    this.start();
    return done;
  }
}
