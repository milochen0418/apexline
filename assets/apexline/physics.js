// The track and the cars, with nothing drawn: shared by the game (game.js) and its tests
// (tests/js/physics.test.mjs).
//
// Coordinates are metres, y up; a car drives in the x-z plane at the height of the road under it.
// Left is +: a car's `d` is how far left of the centre line it is, and a positive steer turns left.
// The track comes from apexline/trackgen.py: points every ds metres round the centre line, the
// racing line, the grip, the corners and where the road crosses itself ("open": no walls).
//
// How a car turns (the idea of capped sideways tyre force from iforce2d's top-down car, the slip
// angle from Marco Monster's Car Physics for Games, kept simple enough never to spin): the steering
// turns the nose, and the tyres bend the car's course towards the nose, as hard as the grip allows
// (pack.car: brake and lat are m/s² times the grip). Under the grip the course follows the nose,
// a few degrees behind it. Over the grip the nose goes on turning a little, up to the car's slide
// angle, while the course bends only as much as it can: the car slides wide, and the tyres, now
// pushing partly backwards, take speed off it. So a car too fast for a corner still points into
// it and loses speed, and far too fast it runs wide into the wall.
//
// All cars share this; what differs is `spec` (garage.js): the road's car (pack.car, the one the
// AI drives and the limits are worked out for) with some of these handling numbers changed.

export const STEP = 1 / 120;
export const GRAVITY = 9.8;

const R_BODY = 1.05; // each car is two circles of this radius, ...
const BODY_OFF = 1.15; // ... this far in front of and behind its middle

export const HANDLING = {
  settle: 0.14, // seconds the tyres take to catch a slide, once the grip can
  slide: 0.3, // the largest angle (radians) the nose may lead the course by
  agility: 0.9, // how much faster than the course the nose can turn at the grip's limit
  turnIn: 0.06, // seconds the nose takes to answer the steering
};

const SLOW = 3; // below this speed (m/s) the tyres just roll where they point
const BRAKE_ROTATE = 1; // braking puts weight on the front tyres: the nose turns in this much more
const KERB = 1.1; // metres of kerb beyond the road's edge, as good as road
const WALL_BOUNCE = 0.25; // of the speed into the wall
const WALL_LOSS = 10; // a hit costs this share of the speed times the sine of its angle squared, ...
const WALL_LOSS_MOST = 0.7; // ... up to this: a scrape costs almost nothing, a real hit a lot
const WALL_RUB = 9; // m/s² while rubbing along a wall, so riding it is never quicker
const WALL_ALIGN = 7; // per second: the nose turns the way the wall runs

// A person's hands (Car.assist).
const KEY_BASE = 5; // m/s² a full key asks for on a straight: enough to change lanes
const KEY_ROAD = 1.3; // and this many times what the road ahead asks for
const KEY_LOOK = 0.8; // seconds of road ahead looked at
const KEY_OVER = 1.25; // with this share of the grip the most it can ask for: the nose turns in
const KEY_EASE = 0.05; // the help eases off the throttle over the last share of a corner's limit
const BRAKE_TURN = 0.5; // braking while steering asks this much more, to rotate the car
const EDGE_KEEP = 0.4; // the help keeps the car's middle this far inside the road's edge, ...
const EDGE_TIME = 0.6; // ... slowing its way to the edge to arrive after this many seconds, ...
const EDGE_SOON = 0.28; // ... and corrects within this many

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export class Track {
  constructor(pack) {
    this.pack = pack;
    const n = (this.n = pack.n);
    this.ds = pack.ds;
    this.length = pack.length;
    this.hw = pack.width / 2;
    this.shoulder = pack.shoulder;
    this.car = pack.car;
    this.x = Float64Array.from(pack.x);
    this.y = Float64Array.from(pack.y);
    this.z = Float64Array.from(pack.z);
    this.line = Float64Array.from(pack.line);
    this.grip = Float64Array.from(pack.grip);
    this.open = Uint8Array.from(pack.open);
    this.corners = pack.corners;
    this.tx = new Float64Array(n);
    this.tz = new Float64Array(n);
    this.nx = new Float64Array(n);
    this.nz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n;
      const b = (i + 1) % n;
      const dx = this.x[b] - this.x[a];
      const dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
      this.nx[i] = this.tz[i];
      this.nz[i] = -this.tx[i];
    }
    // How sharply the racing line bends at each point (left +), smoothed over a few points.
    const lx = new Float64Array(n);
    const lz = new Float64Array(n);
    for (let i = 0; i < n; i++) [lx[i], lz[i]] = this.point(i, this.line[i]);
    const raw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 2 + n) % n;
      const b = (i + 2) % n;
      const t1 = Math.atan2(lz[i] - lz[a], lx[i] - lx[a]);
      const t2 = Math.atan2(lz[b] - lz[i], lx[b] - lx[i]);
      raw[i] = -angleDiff(t2, t1) / (2 * this.ds);
    }
    this.lineBend = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -3; k <= 3; k++) sum += raw[(i + k + n) % n];
      this.lineBend[i] = sum / 7;
    }
    // And how sharply the road itself bends (left +).
    this.roadBend = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -3; k <= 3; k++) {
        const j = (i + k + n) % n;
        sum += -angleDiff(Math.atan2(this.tz[(j + 1) % n], this.tx[(j + 1) % n]), Math.atan2(this.tz[j], this.tx[j])) / this.ds;
      }
      this.roadBend[i] = sum / 7;
    }
    // Which corner each point belongs to (-1: a straight).
    this.cornerAt = new Int16Array(n).fill(-1);
    this.corners.forEach((c, k) => {
      for (let i = c.from; ; i = (i + 1) % n) {
        this.cornerAt[i] = k;
        if (i === c.to) break;
      }
    });
  }

  wrap(i) {
    return ((i % this.n) + this.n) % this.n;
  }

  // The point of the track nearest to (x, z), looking around point `hint` (a car moves a few
  // metres a step, and on the figure eight the other road is far away in points): its index i,
  // how far along to the next point (f, 0..1) and how far left of the centre (d).
  locate(x, z, hint, reach = 24) {
    let best = hint;
    let bestD = Infinity;
    for (let k = -reach; k <= reach; k++) {
      const i = this.wrap(hint + k);
      const dx = x - this.x[i];
      const dz = z - this.z[i];
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) {
        bestD = d2;
        best = i;
      }
    }
    return this.at(x, z, best);
  }

  // The same over the whole track (a car put back on the road).
  locateAll(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.n; i++) {
      const d2 = (x - this.x[i]) ** 2 + (z - this.z[i]) ** 2;
      if (d2 < bestD) {
        bestD = d2;
        best = i;
      }
    }
    return this.at(x, z, best);
  }

  at(x, z, i) {
    const dx = x - this.x[i];
    const dz = z - this.z[i];
    let along = dx * this.tx[i] + dz * this.tz[i];
    let base = i;
    if (along < 0) {
      base = this.wrap(i - 1);
      along += this.ds;
    }
    const f = clamp(along / this.ds, 0, 1);
    return { i: base, f, d: dx * this.nx[i] + dz * this.nz[i] };
  }

  heightAt(i, f) {
    const j = (i + 1) % this.n;
    return this.y[i] + (this.y[j] - this.y[i]) * f;
  }

  // The racing line's point at i, and the point at i moved `off` metres left.
  point(i, off) {
    i = this.wrap(i);
    return [this.x[i] + this.nx[i] * off, this.z[i] + this.nz[i] * off];
  }

  // The fastest a car may take each corner (km/h), as the grip and the racing line's radius allow.
  limits() {
    return Object.fromEntries(this.corners.map((c) => [c.id, c.limit_kmh]));
  }
}

export class Car {
  constructor(track, name, spec = track.car) {
    this.track = track;
    this.name = name;
    this.setSpec(spec);
    this.events = []; // {type: "wall" | "bump" | "lap" | "finish", ...} since the game last read them
    this.reset(0, 0, 0);
  }

  setSpec(spec) {
    this.spec = { ...HANDLING, ...spec };
  }

  // On the grid: `back` points behind point i, `off` metres left of the centre, standing still.
  reset(i, off, back = 0) {
    const tr = this.track;
    const at = tr.wrap(i - back);
    [this.x, this.z] = tr.point(at, off);
    this.yaw = Math.atan2(tr.tz[at], tr.tx[at]);
    this.u = 0; // forward speed
    this.v = 0; // sideways (left) speed: the slide, and a knock's push
    this.turn = 0; // how fast the nose is turning, left + (radians a second)
    this.side = 0; // the tyres' sideways push right now, left + (m/s²)
    this.ax = 0; // the car's forward push right now (m/s²)
    this.spin = 0; // extra turning after a knock
    this.steer = 0; // the wheels' angle, left +
    this.i = at;
    this.f = 0;
    this.d = off;
    this.y = tr.heightAt(at, 0);
    this.pitch = 0;
    this.progress = at <= tr.n / 2 ? at : at - tr.n; // points driven since the start line
    this.sliding = false;
    this.offroad = false;
    this.wallHits = 0;
    this.wallCool = 0;
    this.bumps = 0;
    this.input = { throttle: 0, brake: 0, steer: 0 };
    this.stuck = 0;
    this.backwards = 0;
    this.was = { x: this.x, y: this.y, z: this.z, yaw: this.yaw };
  }

  get lapsDone() {
    return Math.floor(this.progress / this.track.n);
  }

  get speedKmh() {
    return Math.sign(this.u) * Math.hypot(this.u, this.v) * 3.6;
  }

  // How far the car slides: the angle between its nose and its course, left +.
  get slip() {
    return Math.atan2(this.v, Math.max(Math.abs(this.u), SLOW));
  }

  velocity() {
    const hx = Math.cos(this.yaw);
    const hz = Math.sin(this.yaw);
    return [hx * this.u + hz * this.v, hz * this.u - hx * this.v];
  }

  setVelocity(vx, vz) {
    const hx = Math.cos(this.yaw);
    const hz = Math.sin(this.yaw);
    this.u = vx * hx + vz * hz;
    this.v = vx * hz - vz * hx;
  }

  maxSteer() {
    return 0.55 / (1 + Math.abs(this.u) / 18);
  }

  grip() {
    return this.track.grip[this.i] * (this.offroad ? 0.55 : 1);
  }

  // A person's hands, for the car. Keys are all or nothing and don't feel the tyres (BeamNG's and
  // Assetto Corsa's Advanced Steering start from this too), so `steer` here is a share of what the
  // moment calls for, not a wheel angle: with `help` on, a full key on a straight changes lanes,
  // in a bend it follows the bend, and in a tight corner it turns as hard as the grip holds. Held
  // through a corner it goes round it, and `edges` (like Mario Kart's Smart Steering) keeps the
  // car on the road. With help off a full key is always the grip's limit. Braking at the same
  // time asks for more, which turns the nose in. The AI's driver steers finely by itself and
  // doesn't use this.
  assist(input, help = true) {
    if (this.u < SLOW) return input;
    const car = this.spec;
    const speed = Math.hypot(this.u, this.v);
    const limit = (car.lat * this.grip()) / speed;
    const share = clamp(input.steer, -1, 1);
    const full = help ? Math.min(KEY_OVER * limit, KEY_BASE / speed + KEY_ROAD * speed * this.bendAhead(Math.sign(share), speed)) : limit;
    let turn = share * full * (1 + BRAKE_TURN * input.brake);
    let throttle = input.throttle;
    if (help) {
      turn = this.edges(turn);
      // Steering into a corner the car is about as fast as it can take: no more throttle.
      const bend = this.bendAhead(Math.sign(share), speed, this.track.lineBend);
      const most = bend > 1e-4 ? Math.sqrt((car.lat * this.grip()) / bend) : Infinity;
      throttle *= clamp((1 - speed / most) / KEY_EASE + 1, 1 - Math.abs(share), 1);
    }
    const wheel = Math.atan((turn * car.wheelbase) / this.u);
    return { ...input, throttle, steer: clamp(wheel / this.maxSteer(), -1, 1) };
  }

  // How sharply the road (or the racing line) bends towards `side` (left +1, right -1) at its
  // sharpest, just ahead.
  bendAhead(side, speed, bends = this.track.roadBend) {
    const tr = this.track;
    const points = Math.ceil((KEY_LOOK * speed) / tr.ds);
    let most = 0;
    for (let k = 0; k <= points; k++) most = Math.max(most, side * bends[(this.i + k) % tr.n]);
    return most;
  }

  // The nose's turn (`turn`, left +) kept from taking the car off the road: the nearer an edge,
  // the slower the car may drift towards it, and it may hold any turn that does that. It does
  // nothing in the middle of the road, or to a car pointing across it.
  edges(turn) {
    const tr = this.track;
    const i = this.i;
    const [vx, vz] = this.velocity();
    const speed = Math.hypot(vx, vz);
    if (vx * tr.tx[i] + vz * tr.tz[i] < 0.6 * speed) return turn;
    const drift = vx * tr.nx[i] + vz * tr.nz[i]; // leftwards, m/s
    const edge = tr.hw - EDGE_KEEP;
    const road = speed * tr.roadBend[i];
    const most = road + ((edge - this.d) / EDGE_TIME - drift) / (speed * EDGE_SOON);
    const least = road + ((-edge - this.d) / EDGE_TIME - drift) / (speed * EDGE_SOON);
    return most >= least ? clamp(turn, least, most) : (most + least) / 2;
  }

  // Back on the road where it is, pointing the way the race goes.
  putBack() {
    const tr = this.track;
    const loc = tr.locate(this.x, this.z, this.i, 60);
    const i = loc.i;
    [this.x, this.z] = tr.point(i, clamp(loc.d, -tr.hw + 1.5, tr.hw - 1.5));
    this.yaw = Math.atan2(tr.tz[i], tr.tx[i]);
    this.u = this.v = this.spin = this.steer = this.turn = this.side = 0;
    this.stuck = this.backwards = 0;
    this.events.push({ type: "reset" });
  }

  // Where to draw the car `share` of a step after the last one (the screen doesn't keep time
  // with the 120 steps a second: drawn where the step left it, the car would judder).
  pose(share) {
    const was = this.was;
    return {
      x: was.x + (this.x - was.x) * share,
      y: was.y + (this.y - was.y) * share,
      z: was.z + (this.z - was.z) * share,
      yaw: was.yaw + angleDiff(this.yaw, was.yaw) * share,
    };
  }

  step(input, dt) {
    const tr = this.track;
    const car = this.spec;
    this.was = { x: this.x, y: this.y, z: this.z, yaw: this.yaw };
    this.input = input;
    const want = clamp(input.steer, -1, 1) * this.maxSteer();
    this.steer += clamp(want - this.steer, -3 * dt, 3 * dt);

    const grip = this.grip();
    const aLat = car.lat * grip;
    let a = 0;
    if (input.throttle > 0 && this.u > -0.5) a += car.accel * (1 - this.u / car.vmax) * input.throttle;
    if (input.brake > 0) {
      if (this.u > 0.5) a -= car.brake * grip * input.brake;
      else a -= 4 * input.brake; // backwards, slowly
    }
    a -= 0.0005 * this.u * Math.abs(this.u) + 0.12 * Math.sign(this.u);
    if (this.offroad) a -= 3 * Math.sign(this.u);
    const slope = (tr.y[(this.i + 1) % tr.n] - tr.y[this.i]) / tr.ds;
    a -= GRAVITY * slope * 0.6;
    this.ax = a;

    // The nose: as much as the wheels ask, up to what the grip holds at this speed and a bit
    // more, less the further the car already slides out of the turn.
    const slip = this.slip;
    const wantTurn = (this.u * Math.tan(this.steer)) / car.wheelbase; // left +
    const out = -Math.sign(wantTurn) * slip;
    const lead = 1 + car.agility * (1 + BRAKE_ROTATE * input.brake) * (1 - out / car.slide);
    const most = (aLat / Math.max(Math.hypot(this.u, this.v), 1)) * Math.max(0, lead);
    this.turn += (clamp(wantTurn, -most, most) - this.turn) * (1 - Math.exp(-dt / car.turnIn));

    // The tyres: they push the car round with the nose and against any slide, up to the grip.
    this.side = clamp(this.turn * this.u - this.v / car.settle, -aLat, aLat);
    this.u = clamp(this.u + (a + this.turn * this.v) * dt, -8, car.vmax);
    this.v += (this.side - this.turn * this.u) * dt;
    if (Math.abs(this.u) < 0.05 && !input.throttle && !input.brake) this.u = 0;
    this.sliding = Math.abs(slip) > 0.05 && Math.abs(this.u) > 5;
    this.yaw -= (this.turn + this.spin) * dt;
    this.wallCool -= dt;
    this.spin *= Math.exp(-3 * dt);

    const [vx, vz] = this.velocity();
    this.x += vx * dt;
    this.z += vz * dt;
    this.place();
    this.watch(input, dt);
  }

  // Where the car now is on the track: its point, the line it crossed, the wall it hit.
  place() {
    const tr = this.track;
    const before = this.i;
    const loc = tr.locate(this.x, this.z, this.i);
    let delta = loc.i - before;
    if (delta > tr.n / 2) delta -= tr.n;
    if (delta < -tr.n / 2) delta += tr.n;
    const lapsBefore = this.lapsDone;
    this.progress += delta;
    if (this.lapsDone > lapsBefore && this.lapsDone > 0) this.events.push({ type: "lap", laps: this.lapsDone });
    this.i = loc.i;
    this.f = loc.f;
    this.d = loc.d;
    const open = tr.open[loc.i];
    const limit = tr.hw + tr.shoulder - tr.car.width / 2;
    if (!open && Math.abs(loc.d) > limit) {
      const side = Math.sign(loc.d);
      const over = Math.abs(loc.d) - limit;
      const nx = tr.nx[loc.i] * side;
      const nz = tr.nz[loc.i] * side;
      this.x -= nx * over;
      this.z -= nz * over;
      let [vx, vz] = this.velocity();
      const speed = Math.hypot(vx, vz);
      const into = vx * nx + vz * nz;
      // The speed along the wall stays, less a share by the angle of the hit: a scrape costs a
      // little and a head-on hit a lot. Rubbing brakes too, so riding the wall is never quicker.
      const rub = Math.max(0, 1 - (WALL_RUB * STEP) / Math.max(speed, 1));
      vx *= rub;
      vz *= rub;
      if (into > 0) {
        vx -= (1 + WALL_BOUNCE) * into * nx;
        vz -= (1 + WALL_BOUNCE) * into * nz;
        const sine = into / Math.max(speed, 1);
        const knock = 1 - Math.min(WALL_LOSS_MOST, 0.3 * sine + WALL_LOSS * sine * sine);
        vx *= knock;
        vz *= knock;
        if (into > 0.5 && this.wallCool <= 0) {
          this.wallHits += 1;
          this.events.push({ type: "wall", speed: into, i: loc.i });
        }
        if (into > 0.5) this.wallCool = 0.6; // scraping along counts as one knock
      }
      // The nose turns the way the wall runs (the course stays what it is).
      const along = Math.atan2(tr.tz[loc.i], tr.tx[loc.i]);
      const ahead = Math.abs(angleDiff(along, this.yaw)) < Math.PI / 2 ? along : along + Math.PI;
      this.yaw += angleDiff(ahead, this.yaw) * (1 - Math.exp(-WALL_ALIGN * STEP));
      this.setVelocity(vx, vz);
      this.d = side * limit;
    } else if (open && Math.abs(loc.d) > tr.hw + 12) {
      this.putBack(); // left the crossing for the other road
    }
    this.offroad = !open && Math.abs(this.d) > tr.hw + KERB;
    this.y = tr.heightAt(this.i, this.f);
    this.pitch = Math.atan((tr.y[(this.i + 1) % tr.n] - tr.y[this.i]) / tr.ds);
  }

  // Stuck against something, or going the wrong way for long: back on the road.
  watch(input, dt) {
    const tr = this.track;
    this.stuck = input.throttle > 0 && Math.abs(this.u) < 1 ? this.stuck + dt : 0;
    const along = Math.atan2(tr.tz[this.i], tr.tx[this.i]);
    const wrong = Math.abs(angleDiff(along, this.yaw)) > Math.PI * 0.6 && this.u > 3;
    this.backwards = wrong ? this.backwards + dt : 0;
    if (this.stuck > 3 || this.backwards > 4) this.putBack();
  }

  wrongWay() {
    return this.backwards > 0.8;
  }
}

// Two cars that touch push each other apart and trade some speed: a knock from the side shoves,
// one from behind pushes. Returns the push given (0 when they don't touch).
export function collide(a, b) {
  let pushed = 0;
  for (const sa of [BODY_OFF, -BODY_OFF]) {
    for (const sb of [BODY_OFF, -BODY_OFF]) {
      const ax = a.x + Math.cos(a.yaw) * sa;
      const az = a.z + Math.sin(a.yaw) * sa;
      const bx = b.x + Math.cos(b.yaw) * sb;
      const bz = b.z + Math.sin(b.yaw) * sb;
      const dx = bx - ax;
      const dz = bz - az;
      const dist = Math.hypot(dx, dz);
      if (dist >= 2 * R_BODY || dist < 1e-6) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = 2 * R_BODY - dist;
      a.x -= (nx * overlap) / 2;
      a.z -= (nz * overlap) / 2;
      b.x += (nx * overlap) / 2;
      b.z += (nz * overlap) / 2;
      const [avx, avz] = a.velocity();
      const [bvx, bvz] = b.velocity();
      const closing = (bvx - avx) * nx + (bvz - avz) * nz;
      if (closing >= 0) continue;
      const j = (-(1 + 0.35) * closing) / 2;
      a.setVelocity(avx - j * nx, avz - j * nz);
      b.setVelocity(bvx + j * nx, bvz + j * nz);
      // A knock off the middle turns the car a little.
      const sideA = nx * Math.sin(a.yaw) - nz * Math.cos(a.yaw);
      const sideB = nx * Math.sin(b.yaw) - nz * Math.cos(b.yaw);
      a.spin -= 0.12 * sa * j * sideA;
      b.spin += 0.12 * sb * j * sideB;
      pushed = Math.max(pushed, j);
    }
  }
  if (pushed > 0.5) {
    a.bumps += 1;
    b.bumps += 1;
    a.events.push({ type: "bump", push: pushed });
    b.events.push({ type: "bump", push: pushed });
  }
  return pushed;
}
