// The track and the cars, with nothing drawn: shared by the game (game.js) and its tests
// (tests/js/physics.test.mjs).
//
// Coordinates are metres, y up; a car drives in the x-z plane at the height of the road under it.
// Left is +: a car's `d` is how far left of the centre line it is, and a positive steer turns left.
// The track comes from apexline/trackgen.py: points every ds metres round the centre line, the
// racing line, the grip, the corners and where the road crosses itself ("open": no walls).
//
// The car is the same for both drivers: it speeds up less as it nears its top speed, brakes and
// turns as hard as the grip under it allows (pack.car: brake and lat are m/s² times the grip).
// Asked to turn harder than the grip allows, it turns only as much as it can and scrubs speed:
// too fast into a corner, it runs wide into the wall.

export const STEP = 1 / 120;
export const GRAVITY = 9.8;

const R_BODY = 1.05; // each car is two circles of this radius, ...
const BODY_OFF = 1.15; // ... this far in front of and behind its middle

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
  constructor(track, name) {
    this.track = track;
    this.name = name;
    this.events = []; // {type: "wall" | "bump" | "lap" | "finish", ...} since the game last read them
    this.reset(0, 0, 0);
  }

  // On the grid: `back` points behind point i, `off` metres left of the centre, standing still.
  reset(i, off, back = 0) {
    const tr = this.track;
    const at = tr.wrap(i - back);
    [this.x, this.z] = tr.point(at, off);
    this.yaw = Math.atan2(tr.tz[at], tr.tx[at]);
    this.u = 0; // forward speed
    this.v = 0; // sideways (left) speed after a knock, dying away
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
  }

  get lapsDone() {
    return Math.floor(this.progress / this.track.n);
  }

  get speedKmh() {
    return this.u * 3.6;
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

  // Back on the road where it is, pointing the way the race goes.
  putBack() {
    const tr = this.track;
    const loc = tr.locate(this.x, this.z, this.i, 60);
    const i = loc.i;
    [this.x, this.z] = tr.point(i, clamp(loc.d, -tr.hw + 1.5, tr.hw - 1.5));
    this.yaw = Math.atan2(tr.tz[i], tr.tx[i]);
    this.u = this.v = this.spin = this.steer = 0;
    this.stuck = this.backwards = 0;
    this.events.push({ type: "reset" });
  }

  step(input, dt) {
    const tr = this.track;
    const car = tr.car;
    this.input = input;
    const want = clamp(input.steer, -1, 1) * this.maxSteer();
    this.steer += clamp(want - this.steer, -3 * dt, 3 * dt);

    const grip = tr.grip[this.i] * (this.offroad ? 0.55 : 1);
    const aLat = car.lat * grip;
    let a = 0;
    if (input.throttle > 0 && this.u > -0.5) a += car.accel * (1 - this.u / car.vmax) * input.throttle * (this.sliding ? 0.5 : 1);
    if (input.brake > 0) {
      if (this.u > 0.5) a -= car.brake * grip * input.brake;
      else a -= 4 * input.brake; // backwards, slowly
    }
    a -= 0.0005 * this.u * Math.abs(this.u) + 0.12 * Math.sign(this.u);
    if (this.offroad) a -= 3 * Math.sign(this.u);
    const slope = (tr.y[(this.i + 1) % tr.n] - tr.y[this.i]) / tr.ds;
    a -= GRAVITY * slope * 0.6;
    this.u = clamp(this.u + a * dt, -8, car.vmax);
    if (Math.abs(this.u) < 0.05 && !input.throttle && !input.brake) this.u = 0;

    // Turning: as much as the wheels ask, up to what the grip holds.
    const wantTurn = (this.u * Math.tan(this.steer)) / car.wheelbase; // left +
    const canTurn = aLat / Math.max(Math.abs(this.u), 1);
    const turn = clamp(wantTurn, -canTurn, canTurn);
    const excess = Math.abs(wantTurn) - canTurn;
    this.sliding = excess > 0.02 * canTurn && Math.abs(this.u) > 5;
    if (excess > 0) this.u -= Math.sign(this.u) * Math.min(Math.abs(this.u), Math.min(excess * Math.abs(this.u), aLat) * 0.35 * dt);
    this.yaw -= (turn + this.spin) * dt;
    this.wallCool -= dt;
    this.spin *= Math.exp(-3 * dt);
    this.v *= Math.exp(-4 * dt);

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
      const into = vx * nx + vz * nz;
      // Rubbing along the wall brakes the car hard, so riding it is never quicker.
      const rub = Math.max(0, 1 - (22 * STEP) / Math.max(Math.hypot(vx, vz), 1));
      vx *= rub;
      vz *= rub;
      if (into > 0) {
        vx -= 1.3 * into * nx;
        vz -= 1.3 * into * nz;
        const knock = Math.max(0.4, 1 - 0.25 - 0.05 * into);
        vx *= knock;
        vz *= knock;
        // The nose turns a little the way the wall runs.
        const along = Math.atan2(tr.tz[loc.i], tr.tx[loc.i]);
        const ahead = Math.abs(angleDiff(along, this.yaw)) < Math.PI / 2 ? along : along + Math.PI;
        this.yaw += angleDiff(ahead, this.yaw) * 0.12;
        this.setVelocity(vx, vz);
        if (this.wallCool <= 0) {
          this.wallHits += 1;
          this.events.push({ type: "wall", speed: into, i: loc.i });
        }
        this.wallCool = 0.6; // scraping along counts as one knock
      }
      this.d = side * limit;
    } else if (open && Math.abs(loc.d) > tr.hw + 12) {
      this.putBack(); // left the crossing for the other road
    }
    this.offroad = !open && Math.abs(this.d) > tr.hw;
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
