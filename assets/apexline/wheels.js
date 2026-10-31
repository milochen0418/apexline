// The wheels: a tyre with a tread and writing on its wall, a rim of the car's own pattern, and the
// brake behind it. The face of a rim is drawn on the +z side.

import * as THREE from "three";
import { turned } from "./bodywork.js";

function tyreTexture({ tread = "slick", wall = "APEXLINE", wallInk = "#6b6b70" }) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#17171a";
  g.fillRect(0, 0, 1024, 256);
  // The middle of the sheet is the tread, its edges the walls.
  g.fillStyle = "#101012";
  g.fillRect(0, 72, 1024, 112);
  if (tread === "groove") {
    g.fillStyle = "#050506";
    for (const y of [92, 126, 160]) g.fillRect(0, y, 1024, 5);
  } else if (tread === "knobbly") {
    g.fillStyle = "#050506";
    for (let k = 0; k < 64; k++) {
      const x = (k * 1024) / 64;
      g.fillRect(x, 72, 5, 112);
      g.fillRect(x + (k % 2) * 8, 116 + (k % 2) * 8, 16, 4);
    }
    for (const y of [100, 156]) g.fillRect(0, y, 1024, 5);
  }
  g.fillStyle = wallInk;
  g.font = 'bold 22px "Helvetica Neue", Arial, sans-serif';
  g.textBaseline = "middle";
  for (const [x, flip] of [[120, 0], [632, 0]]) {
    g.save();
    g.translate(x, 228);
    g.scale(1, -1);
    g.fillText(wall, 0, 0);
    g.restore();
    g.fillText(wall, x + 40, 26);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 2;
  return t;
}

// The holes of a rim's face, from the spokes' pattern.
function rimShape(R, hub, spokes, { gapIn, gapOut, twin = 0, boltHole = false }) {
  const s = new THREE.Shape();
  s.absarc(0, 0, R, 0, Math.PI * 2, false);
  const arc = (r, a, b, n = 8) => Array.from({ length: n + 1 }, (_, k) => {
    const t = a + ((b - a) * k) / n;
    return new THREE.Vector2(r * Math.cos(t), r * Math.sin(t));
  });
  const addHole = (a0, a1, b0, b1, r0, r1) => {
    const pts = [...arc(r0, a0, a1, 2), ...arc(r1, b1, b0, 5)];
    s.holes.push(new THREE.Path(pts.reverse()));
  };
  const step = (Math.PI * 2) / spokes;
  const r0 = hub + 0.015;
  const r1 = R - 0.018;
  for (let k = 0; k < spokes; k++) {
    const a = k * step;
    if (twin) {
      const mid = a + step / 2;
      addHole(a + gapIn, mid - twin / 2 - gapIn * 0.1, a + gapOut, mid - twin, r0, r1);
      addHole(mid + twin / 2 + gapIn * 0.1, a + step - gapIn, mid + twin, a + step - gapOut, r0, r1);
    } else addHole(a + gapIn, a + step - gapIn, a + gapOut, a + step - gapOut, r0, r1);
  }
  return s;
}

const paint = (geo, color) => {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) a.set([c.r, c.g, c.b], k * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo;
};

function merge(geos) {
  const plain = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of plain) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let at = 0;
  for (const g of plain) {
    pos.set(g.attributes.position.array, at * 3);
    nor.set(g.attributes.normal.array, at * 3);
    col.set(g.attributes.color.array, at * 3);
    at += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return out;
}

// One wheel. o: {radius, width, rimRadius, spokes, gapIn, gapOut, twin, hub, dish, rim (colour),
// lip (colour), nut (colour), tread, wall}.
export function wheelParts(o) {
  const { radius: R, width: W, rimRadius: Rr = R * 0.7 } = o;
  const hw = W / 2;
  const tyre = new THREE.LatheGeometry(
    [[Rr - 0.01, hw * 0.92], [Rr + 0.02, hw], [R - 0.05, hw * 1.02], [R - 0.012, hw * 0.92], [R, hw * 0.72], [R, 0], [R, -hw * 0.72], [R - 0.012, -hw * 0.92], [R - 0.05, -hw * 1.02], [Rr + 0.02, -hw], [Rr - 0.01, -hw * 0.92]].map(([r, z]) => new THREE.Vector2(r, z)),
    32,
  );
  tyre.rotateX(Math.PI / 2);
  // The sheet across the tyre by how far along the profile a point is.
  const uv = tyre.attributes.uv;
  const p = tyre.attributes.position;
  for (let k = 0; k < p.count; k++) {
    const z = p.getZ(k);
    const r = Math.hypot(p.getX(k), p.getY(k));
    const onWall = 1 - Math.min(1, Math.max(0, (R - r) / (R - Rr)));
    uv.setXY(k, Math.atan2(p.getY(k), p.getX(k)) / (Math.PI * 2) + 0.5, r > R - 0.02 ? 0.5 + (z / hw) * 0.2 : z > 0 ? 0.05 + onWall * 0.23 : 0.95 - onWall * 0.23);
  }
  const face = o.dish ?? 0.05;
  const lip = paint(turned([[Rr * 1.0, hw * 0.78], [Rr * 1.03, hw * 0.86], [Rr * 1.03, hw * 0.9], [Rr * 0.97, hw * 0.9], [Rr * 0.95, hw * 0.8]], 0, 0, 0, 28), o.lip || o.rim);
  const barrel = paint(turned([[Rr * 0.985, -hw * 0.8], [Rr * 0.985, hw * 0.45], [Rr * 1.0, hw * 0.78], [Rr * 0.95, hw * 0.8], [Rr * 0.92, hw * 0.3]], 0, 0, 0, 20), "#3a3b40");
  const shape = rimShape(Rr * 0.95, o.hub ?? 0.055, o.spokes ?? 5, { gapIn: o.gapIn ?? 0.16, gapOut: o.gapOut ?? 0.1, twin: o.twin ?? 0 });
  const spoke = new THREE.ExtrudeGeometry(shape, { depth: 0.024, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 1, curveSegments: 12 });
  spoke.translate(0, 0, hw * 0.86 - 0.03 - face);
  paint(spoke, o.rim);
  const hub = paint(turned([[0.06, hw * 0.86 - face - 0.012], [0.045, hw * 0.86 - face + 0.006], [0.03, hw * 0.86 - face + 0.018], [0.001, hw * 0.86 - face + 0.018]], 0, 0, 0, 10), o.nut || o.rim);
  const disc = paint(turned([[0.06, hw * 0.1], [Rr * 0.76, hw * 0.1], [Rr * 0.76, hw * 0.1 + 0.018], [0.06, hw * 0.1 + 0.018]], 0, 0, 0, 20), "#71717a");
  const well = paint(turned([[Rr * 0.95, -hw * 0.5], [0.02, -hw * 0.5]], 0, 0, 0, 12), "#0a0a0c");
  const spin = merge([lip, barrel, spoke, hub, disc, well]);
  const caliper = new THREE.TorusGeometry(Rr * 0.67, 0.042, 8, 8, 1.0);
  caliper.scale(1, 1, 1.4);
  caliper.rotateZ(Math.PI * 0.08);
  caliper.translate(0, 0, hw * 0.1 + 0.02);
  // What a rim looks like going fast: the spokes run together.
  const blur = turned([[Rr * 0.97, hw * 0.87], [Rr * 0.5, hw * 0.84 - face * 0.5], [0.055, hw * 0.8 - face], [0.001, hw * 0.8 - face]], 0, 0, 0, 20);
  return { tyre, spin, caliper, blur, tyreTexture: tyreTexture(o) };
}
