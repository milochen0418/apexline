// How the cars are made, with no model files: a body is a skin lofted along the car from a few
// curves (the height of the deck, the width, the sill...), with its wheel arches cut out of the
// lower edge, and every other part is a small shape added to one of a few meshes, one per material.
// The livery (livery.js) is sprayed on from outside, as a wrap is: each triangle of the paint mesh
// takes its colour from the side, top, front or rear drawing of the car, whichever it faces most.
//
// The car faces +x, y is up and +z is its right. Metres.

import * as THREE from "three";

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// A bump of height 1 at `at`, falling to 0 at `reach` from it.
export const bump = (x, at, reach) => 1 - smooth(0, reach, Math.abs(x - at));

// The value through keys [[x, v], ...], x rising: a monotone cubic, which never overshoots them.
export function curve(keys) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const vs = keys.map((k) => k[1]);
  const slopes = [];
  for (let i = 0; i < n - 1; i++) slopes.push((vs[i + 1] - vs[i]) / (xs[i + 1] - xs[i]));
  const m = [slopes[0]];
  for (let i = 1; i < n - 1; i++) m.push(slopes[i - 1] * slopes[i] <= 0 ? 0 : (2 * slopes[i - 1] * slopes[i]) / (slopes[i - 1] + slopes[i]));
  m.push(slopes[n - 2]);
  return (x) => {
    if (x <= xs[0]) return vs[0];
    if (x >= xs[n - 1]) return vs[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * vs[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * vs[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ------------------------------------------------------------ the drawing sheet

// Where each view of the car lies on the livery's canvas (livery.js draws on it).
export const SHEET = (() => {
  const S = 300; // pixels a metre
  const PAD = 10;
  const len = 4.9;
  const tall = 1.8;
  const wide = 2.4;
  const rect = (x, y, w, h) => ({ x, y, w, h });
  const l = Math.round(len * S);
  const t = Math.round(tall * S);
  const b = Math.round(wide * S);
  const right = rect(PAD, PAD, l, t);
  const left = rect(PAD, PAD * 2 + t, l, t);
  const top = rect(PAD, PAD * 3 + 2 * t, l, b);
  const front = rect(PAD * 2 + l, PAD, b, t);
  const rear = rect(PAD * 2 + l, PAD * 2 + t, b, t);
  return { S, len, tall, wide, right, left, top, front, rear, w: PAD * 3 + l + b, h: PAD * 4 + 2 * t + b };
})();

const X0 = -SHEET.len / 2;
const Y1 = SHEET.tall;
const Z0 = -SHEET.wide / 2;

// Where a point falls on the sheet, in pixels from its top left, in the view named.
function onSheet(view, x, y, z) {
  const S = SHEET.S;
  const r = SHEET[view];
  if (view === "right") return [r.x + (x - X0) * S, r.y + (Y1 - y) * S];
  if (view === "left") return [r.x + r.w - (x - X0) * S, r.y + (Y1 - y) * S];
  if (view === "top") return [r.x + (x - X0) * S, r.y + (z - Z0) * S];
  if (view === "front") return [r.x + r.w - (z - Z0) * S, r.y + (Y1 - y) * S];
  return [r.x + (z - Z0) * S, r.y + (Y1 - y) * S];
}

// The view a surface facing (nx, ny, nz) is sprayed from. `up`: how far it must face up to take
// the top view; a raked windscreen takes it, a door doesn't.
function viewOf(nx, ny, nz, up) {
  if (ny > up) return "top";
  if (Math.abs(nz) >= Math.abs(nx) * 0.85) return nz > 0 ? "right" : "left";
  return nx > 0 ? "front" : "rear";
}

// A mesh as plain triangles with the sheet's coordinates: what the paint mesh is made of. `only(x,
// z)` may name the view for a triangle whatever way it faces.
export function sprayed(geo, up = 0.72, only = null) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let k = 0; k < p.count; k += 3) {
    const nx = n.getX(k) + n.getX(k + 1) + n.getX(k + 2);
    const ny = n.getY(k) + n.getY(k + 1) + n.getY(k + 2);
    const nz = n.getZ(k) + n.getZ(k + 1) + n.getZ(k + 2);
    const len = Math.hypot(nx, ny, nz) || 1;
    const view = (only && only(p.getX(k), p.getZ(k))) || viewOf(nx / len, ny / len, nz / len, up);
    for (let c = 0; c < 3; c++) {
      const [px, py] = onSheet(view, p.getX(k + c), p.getY(k + c), p.getZ(k + c));
      uv[(k + c) * 2] = px / SHEET.w;
      uv[(k + c) * 2 + 1] = 1 - py / SHEET.h;
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

// ------------------------------------------------------------ lofted skins

const superSin = (a, n) => Math.pow(Math.max(0, Math.sin(a)), 2 / n);
const superCos = (a, n) => Math.pow(Math.max(0, Math.cos(a)), 2 / n);

// The section at one place along the car, from the middle of the deck (t = 0) over the shoulder
// to the side's widest (t = waistAt) and down to the sill (t = 1), on the right.
// q: {top, waist, low, width, foot, upper, lower}: the deck's height, the widest line's height,
// the sill's height, the half widths at the widest and at the sill, and how square the upper and
// lower parts are (2: round, more: squarer).
const WAIST_AT = 0.62;
function sectionPoint(q, t) {
  if (t <= WAIST_AT) {
    const a = (t / WAIST_AT) * Math.PI * 0.5;
    return [q.waist + (q.top - q.waist) * superCos(a, q.upper), q.width * superSin(a, q.upper)];
  }
  const a = ((t - WAIST_AT) / (1 - WAIST_AT)) * Math.PI * 0.5;
  return [q.waist - (q.waist - q.low) * superSin(a, q.lower), q.foot + (q.width - q.foot) * superCos(a, q.lower)];
}

// How far down the section the skin goes here: to the sill, or to the arch's edge over a wheel.
function reach(q, arches, x, scale) {
  let edge = -Infinity;
  for (const a of arches) {
    const dx = x - a.x;
    if (Math.abs(dx) < a.r) edge = Math.max(edge, a.y + Math.sqrt(a.r * a.r - dx * dx));
  }
  if (edge === -Infinity || scale < 1) return 1;
  if (sectionPoint(q, 1)[0] >= edge) return 1;
  let lo = 0.25;
  let hi = 1;
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2;
    if (sectionPoint(q, mid)[0] > edge) lo = mid;
    else hi = mid;
  }
  return lo;
}

// The places along the car a skin is cut: evenly, closer round the arches, and each end rounded off
// (`caps`: [tail, nose], each [depth, squareness]) by shrinking the last sections to nothing.
function stationsOf(x0, x1, arches, caps, step, archSteps) {
  const [tail, nose] = caps;
  const from = x0 + (tail ? tail[0] : 0);
  const to = x1 - (nose ? nose[0] : 0);
  const xs = [];
  for (let x = from; x < to; x += step) xs.push(x);
  xs.push(to);
  for (const a of arches) {
    for (let k = 0; k <= archSteps; k++) {
      const x = a.x + a.r * Math.cos((k / archSteps) * Math.PI);
      if (x > from && x < to) xs.push(x);
    }
  }
  xs.sort((a, b) => a - b);
  const out = [];
  for (const x of xs) if (!out.length || x - out[out.length - 1].x > 0.002) out.push({ x, s: 1 });
  const shrink = [0.97, 0.9, 0.8, 0.66, 0.46, 0.22, 0];
  if (tail) for (const s of shrink) out.unshift({ x: from - tail[0] * Math.pow(1 - Math.pow(s, tail[1]), 1 / tail[1]), s, base: from });
  if (nose) for (const s of shrink) out.push({ x: to + nose[0] * Math.pow(1 - Math.pow(s, nose[1]), 1 / nose[1]), s, base: to });
  return out;
}

// A skin along the car. spec: {from, to, at(x) -> section q, arches, caps, step, rows, shape(p),
// lip}. `shape` may move each point [x, y, z] of the right side. `lip` turns the lower edge inwards
// by that much, so the panels have an edge and don't end in a knife.
export function loft({ from, to, at, arches = [], caps = [null, null], step = 0.07, rows = 24, archSteps = 18, shape = null, lip = 0.05 }) {
  const stations = stationsOf(from, to, arches, caps, step, archSteps);
  const grid = stations.map((st) => {
    const q = at(st.base ?? st.x);
    const limit = reach(q, arches, st.x, st.s);
    const midY = (q.top + q.low) / 2;
    const col = [];
    for (let j = 0; j <= rows; j++) {
      const [y, z] = sectionPoint(q, (j / rows) * limit);
      const p = [st.x, midY + (y - midY) * st.s, z * st.s];
      col.push(shape ? shape(p) || p : p);
    }
    // Past the sill: at the ends, the floor closes the shrunk section; along the car, a lip.
    const last = col[rows];
    if (st.s < 1) col.push([st.x, last[1], last[2] / 2], [st.x, last[1], 0]);
    else {
      const edge = [st.x, last[1] + 0.012, Math.max(0, last[2] - lip)];
      col.push(edge, edge.slice());
    }
    return col;
  });
  const ni = grid.length;
  const nj = rows + 3;
  const pos = new Float32Array(ni * nj * 3 * 2);
  const nor = new Float32Array(ni * nj * 3 * 2);
  const idx = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  for (let i = 0; i < ni; i++) {
    for (let j = 0; j < nj; j++) {
      const p = grid[i][j];
      const along = sub(grid[Math.min(ni - 1, i + 1)][j], grid[Math.max(0, i - 1)][j]);
      const across = sub(grid[i][Math.min(nj - 1, j + 1)], grid[i][Math.max(0, j - 1)]);
      let nx = across[1] * along[2] - across[2] * along[1];
      let ny = across[2] * along[0] - across[0] * along[2];
      let nz = across[0] * along[1] - across[1] * along[0];
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-10) {
        // A shrunk end: it faces along the car.
        nx = i < ni / 2 ? -1 : 1;
        ny = 0;
        nz = 0;
      } else {
        nx /= len;
        ny /= len;
        nz /= len;
      }
      if (j === 0) nz = 0;
      const k = (i * nj + j) * 3;
      pos.set(p, k);
      nor.set([nx, ny, nz], k);
      const m = k + ni * nj * 3;
      pos.set([p[0], p[1], -p[2]], m);
      nor.set([nx, ny, -nz], m);
    }
  }
  // Which way round the triangles go, from a point high on the side.
  const a = Math.floor(ni / 2);
  const flip = nor[(a * nj + Math.floor(rows * 0.5)) * 3 + 2] < 0;
  if (flip) for (let k = 0; k < nor.length; k++) nor[k] = -nor[k];
  const second = ni * nj;
  const quad = (p, q, r, s) => idx.push(p, q, r, q, s, r);
  for (let i = 0; i < ni - 1; i++) {
    for (let j = 0; j < nj - 1; j++) {
      const p = i * nj + j;
      const q = (i + 1) * nj + j;
      const r = i * nj + j + 1;
      const s = (i + 1) * nj + j + 1;
      if (flip) {
        quad(p, q, r, s);
        quad(second + p, second + r, second + q, second + s);
      } else {
        quad(p, r, q, s);
        quad(second + p, second + q, second + r, second + s);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------ small shapes

// The same shape on the other side of the car.
export function mirrored(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const flipped = (attr, size) => {
    const a = attr.array;
    for (let k = 0; k < attr.count; k += 3) {
      for (let c = 0; c < size; c++) {
        const t = a[(k + 1) * size + c];
        a[(k + 1) * size + c] = a[(k + 2) * size + c];
        a[(k + 2) * size + c] = t;
      }
    }
  };
  for (let k = 0; k < p.count; k++) p.setZ(k, -p.getZ(k));
  if (n) for (let k = 0; k < n.count; k++) n.setZ(k, -n.getZ(k));
  flipped(p, 3);
  if (n) flipped(n, 3);
  if (g.attributes.uv) flipped(g.attributes.uv, 2);
  return g;
}

// A tube along points [[x, y, z], ...]; `radius` a number or a function of the share along it.
export function tube(points, radius, { sides = 10, closed = false, ends = true } = {}) {
  const path = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, "catmullrom", 0.5);
  const n = Math.max(2, (points.length - 1) * 10);
  const frames = path.computeFrenetFrames(n, closed);
  const pos = [];
  const nor = [];
  const idx = [];
  const pt = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    path.getPointAt(i / n, pt);
    const r = typeof radius === "function" ? radius(i / n) : radius;
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const nn = frames.normals[i];
      const bb = frames.binormals[i];
      const dx = c * nn.x + s * bb.x;
      const dy = c * nn.y + s * bb.y;
      const dz = c * nn.z + s * bb.z;
      pos.push(pt.x + r * dx, pt.y + r * dy, pt.z + r * dz);
      nor.push(dx, dy, dz);
    }
  }
  const row = sides + 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * row + j;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// A box with rounded edges, centred at (x, y, z).
export function block(w, h, d, x, y, z, round = 0.02) {
  const r = Math.min(round, w / 2 - 1e-3, h / 2 - 1e-3);
  const shape = new THREE.Shape();
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  shape.absarc(hw, hh, r, 0, Math.PI / 2, false);
  shape.absarc(-hw, hh, r, Math.PI / 2, Math.PI, false);
  shape.absarc(-hw, -hh, r, Math.PI, Math.PI * 1.5, false);
  shape.absarc(hw, -hh, r, Math.PI * 1.5, Math.PI * 2, false);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-3, d - 2 * r), bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelOffset: -r, bevelSegments: 2, curveSegments: 3 });
  g.translate(x, y, z - (d - 2 * r) / 2);
  return g;
}

// A disc-shaped thing round the z axis from a profile [[radius, z], ...], centred at (x, y, z).
export function turned(profile, x, y, z, segments = 28) {
  const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(Math.max(r, 1e-4), h)), segments);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

// A wing's section across the car: an airfoil `chord` long and `thick` deep, `span` wide, leaning
// back by `pitch`, centred at (x, y, 0) (its nose towards +x).
export function wing(chord, thick, span, x, y, pitch = 0.12, z = 0) {
  const s = new THREE.Shape();
  s.moveTo(chord / 2, 0);
  s.bezierCurveTo(chord * 0.38, thick * 0.9, -chord * 0.1, thick * 0.75, -chord / 2, thick * 0.05);
  s.lineTo(-chord / 2, -thick * 0.05);
  s.bezierCurveTo(-chord * 0.1, -thick * 0.22, chord * 0.38, -thick * 0.28, chord / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -span / 2);
  g.rotateZ(pitch);
  g.translate(x, y, z);
  return g;
}

// Any flat outline (points [[a, b], ...] in the x-y plane) as a plate `depth` thick across z.
export function plate(points, depth, z = 0, bevel = 0) {
  const s = new THREE.Shape();
  points.forEach(([a, b], k) => (k ? s.lineTo(a, b) : s.moveTo(a, b)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 });
  g.translate(0, 0, z - depth / 2);
  return g;
}

export function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(m);
  return geo;
}

// One mesh per material, each of many shapes.
export class Parts {
  constructor() {
    this.lists = {};
  }

  add(material, ...geos) {
    (this.lists[material] ||= []).push(...geos);
  }

  // A painted skin (see loft and sprayed), and a coarse one for when the car is far away: `paint`
  // and `far`. Triangles smaller than a pixel cost a lot and show nothing.
  skin(spec, up, only) {
    this.add("paint", sprayed(loft(spec), up, only));
    this.add("far", sprayed(loft({ ...spec, rows: Math.round((spec.rows ?? 24) / 2.5), step: (spec.step ?? 0.07) * 3.5, archSteps: 7, lip: 0 }), up, only));
  }

  // Everything added to `material`, as one geometry of plain triangles.
  merged(material) {
    const list = this.lists[material];
    if (!list || !list.length) return null;
    const plain = list.map((g) => (g.index ? g.toNonIndexed() : g));
    let count = 0;
    for (const g of plain) {
      if (!g.attributes.normal) g.computeVertexNormals();
      count += g.attributes.position.count;
    }
    const hasUv = plain.every((g) => g.attributes.uv);
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const uv = hasUv ? new Float32Array(count * 2) : null;
    let at = 0;
    for (const g of plain) {
      pos.set(g.attributes.position.array, at * 3);
      nor.set(g.attributes.normal.array, at * 3);
      if (uv) uv.set(g.attributes.uv.array, at * 2);
      at += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    if (uv) out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return out;
  }
}
