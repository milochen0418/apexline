// The world round the track: the sky, the ground rising and falling with the road, the road with
// its lines, kerbs and walls, the start gantry, and the things that make each track's place (trees,
// palms, towers, lamps, cacti, rocks, the sea, rain, snow). Everything comes from the track's
// points, so a new track needs no drawing.

import * as THREE from "three";

export const THEMES = {
  sunny: { sky: ["#3f8ff0", "#d6ebff"], fog: ["#d6ebff", 300, 1500], ground: ["#4f8f3a", "#3e7a2f"], road: "#3b3d43", wall: ["#ffffff", "#e11d48"], sun: 2.2, hemi: 1.1, hills: 6, deco: { tree: 170, bush: 90 }, stands: 2 },
  coast: { sky: ["#f59e6c", "#ffe4bf"], fog: ["#ffd9b0", 300, 1500], ground: ["#dcc690", "#c9b075"], road: "#45464b", wall: ["#ffffff", "#0ea5e9"], sun: 2.0, sunColor: "#ffd2a0", hemi: 1.0, hills: 4, sea: true, deco: { palm: 130, rock: 40, bush: 40 }, stands: 1 },
  mountain: { sky: ["#6ea7e0", "#e5f0fb"], fog: ["#dde9f5", 250, 1300], ground: ["#5b7a4c", "#4b6a3d"], road: "#3e3f44", wall: ["#f4f4f5", "#f59e0b"], sun: 2.1, hemi: 1.0, hills: 45, deco: { pine: 300, rock: 90 }, stands: 0 },
  stadium: { sky: ["#3b82f6", "#cfe3ff"], fog: ["#cfe3ff", 300, 1500], ground: ["#3f8f3f", "#367d36"], road: "#3a3c41", wall: ["#ffffff", "#7c3aed"], sun: 2.2, hemi: 1.1, hills: 2, deco: { tree: 70, bush: 40 }, stands: 6 },
  city: { sky: ["#5b8fd0", "#dce8f4"], fog: ["#cfdbe8", 250, 1300], ground: ["#7a7f86", "#6c7178"], road: "#33353a", wall: ["#e5e7eb", "#f97316"], sun: 2.0, hemi: 1.0, hills: 0, deco: { building: 170, lamp: 40 }, stands: 1 },
  ice: { sky: ["#9cc3e6", "#f4f8fd"], fog: ["#eef4fa", 200, 1100], ground: ["#eef3f8", "#dfe8f1"], road: "#b9d4ea", ice: true, wall: ["#ffffff", "#2563eb"], sun: 1.8, hemi: 1.2, hills: 10, deco: { pine: 170, snowpile: 70 }, stands: 0, snow: true },
  desert: { sky: ["#e7b06a", "#fbe7c4"], fog: ["#f6dcaf", 300, 1500], ground: ["#e0c084", "#d3ae6c"], road: "#4a4642", wall: ["#fef3c7", "#b45309"], sun: 2.4, sunColor: "#ffe2b0", hemi: 1.0, hills: 14, deco: { cactus: 140, rock: 70 }, stands: 0 },
  night: { sky: ["#05081a", "#1a2347"], fog: ["#0d1330", 120, 700], ground: ["#1b2a1d", "#16231a"], road: "#2a2c31", wall: ["#e5e7eb", "#dc2626"], sun: 0.25, sunColor: "#9db4ff", hemi: 0.25, hills: 4, night: true, deco: { tree: 70, building: 60 }, stands: 1 },
  rain: { sky: ["#56606b", "#9aa3ad"], fog: ["#8f99a3", 80, 700], ground: ["#3e5a3b", "#344e32"], road: "#2b2d31", wet: true, wall: ["#f4f4f5", "#eab308"], sun: 0.9, hemi: 1.0, hills: 6, rain: true, deco: { tree: 140, bush: 60 }, stands: 2 },
  gp: { sky: ["#3f86de", "#d4e7ff"], fog: ["#d4e7ff", 350, 1700], ground: ["#4b8d3b", "#3f7c31"], road: "#393b40", wall: ["#ffffff", "#16a34a"], sun: 2.2, hemi: 1.1, hills: 18, deco: { tree: 200, rock: 40, bush: 60 }, stands: 6 },
};

// A small seeded random, so a track always looks the same.
export function random(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (Math.imul(s, 31) + ch.charCodeAt(0)) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Points of the track in 20 m cells, for "how far is the road from here".
class Near {
  constructor(track) {
    this.track = track;
    this.cells = new Map();
    for (let i = 0; i < track.n; i++) {
      const key = `${Math.floor(track.x[i] / 20)},${Math.floor(track.z[i] / 20)}`;
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(i);
    }
  }

  find(x, z, reach = 5) {
    const cx = Math.floor(x / 20);
    const cz = Math.floor(z / 20);
    let best = -1;
    let bestD = Infinity;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const list = this.cells.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (const i of list) {
          const d = (x - this.track.x[i]) ** 2 + (z - this.track.z[i]) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return { i: best, dist: Math.sqrt(bestD) };
  }
}

function canvasTexture(w, h, draw, repeat = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function roadTexture(color, rnd) {
  return canvasTexture(256, 512, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 2600; k++) {
      const v = 30 + Math.floor(rnd() * 60);
      g.fillStyle = `rgba(${v},${v},${v},${0.08 + rnd() * 0.12})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillRect(w * 0.035, 0, w * 0.018, h);
    g.fillRect(w * 0.947, 0, w * 0.018, h);
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.fillRect(w * 0.492, 0, w * 0.016, h * 0.45);
  });
}

function stripes(a, b, count = 2, across = false) {
  return canvasTexture(64, 64, (g, w, h) => {
    for (let k = 0; k < count; k++) {
      g.fillStyle = k % 2 ? b : a;
      if (across) g.fillRect(0, (k * h) / count, w, h / count);
      else g.fillRect((k * w) / count, 0, w / count, h);
    }
  });
}

// A strip along the track from offset a to offset b (metres left of the centre), at height dy
// over the road, for the points from..to.
function ribbon(track, from, to, a, b, dy, vScale) {
  const n = track.n;
  const count = ((to - from + n) % n) + 1;
  const pos = new Float32Array(count * 2 * 3);
  const uv = new Float32Array(count * 2 * 2);
  const idx = [];
  for (let k = 0; k < count; k++) {
    const i = (from + k) % n;
    for (let s = 0; s < 2; s++) {
      const off = s ? b : a;
      const p = (k * 2 + s) * 3;
      pos[p] = track.x[i] + track.nx[i] * off;
      pos[p + 1] = track.y[i] + dy;
      pos[p + 2] = track.z[i] + track.nz[i] * off;
      uv[(k * 2 + s) * 2] = s;
      uv[(k * 2 + s) * 2 + 1] = (k * track.ds) / vScale;
    }
    if (k < count - 1) {
      const q = k * 2;
      idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// The closed road: every point, and the first again at the end.
function loopRibbon(track, a, b, dy, vScale) {
  const n = track.n;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const uv = new Float32Array((n + 1) * 2 * 2);
  const idx = [];
  for (let k = 0; k <= n; k++) {
    const i = k % n;
    for (let s = 0; s < 2; s++) {
      const off = s ? b : a;
      const p = (k * 2 + s) * 3;
      pos[p] = track.x[i] + track.nx[i] * off;
      pos[p + 1] = track.y[i] + dy + (track.open[i] && s ? 0.004 : 0);
      pos[p + 2] = track.z[i] + track.nz[i] * off;
      uv[(k * 2 + s) * 2] = s;
      uv[(k * 2 + s) * 2 + 1] = (k * track.ds) / vScale;
    }
    if (k < n) {
      const q = k * 2;
      idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function wallGeometry(track, side, height) {
  const n = track.n;
  const off = side * (track.hw + track.shoulder);
  const pos = [];
  const uv = [];
  const idx = [];
  let run = -1;
  for (let k = 0; k <= n; k++) {
    const i = k % n;
    if (track.open[i]) {
      run = -1;
      continue;
    }
    const x = track.x[i] + track.nx[i] * off;
    const z = track.z[i] + track.nz[i] * off;
    const base = pos.length / 3;
    pos.push(x, track.y[i] - 0.6, z, x, track.y[i] + height, z);
    uv.push((k * track.ds) / 4, 0, (k * track.ds) / 4, 1);
    if (run >= 0) idx.push(run, base, run + 1, run + 1, base, base + 1);
    run = base;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function skyDome(top, bottom) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: "varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vPos; void main(){ float h = clamp(vPos.y * 1.6 + 0.12, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }",
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), mat);
  mesh.renderOrder = -1;
  return mesh;
}

// Falling rain or snow round a point (moved to each camera before it draws).
function weather(kind) {
  const count = kind === "rain" ? 5000 : 3000;
  const box = new THREE.Vector3(90, 45, 90);
  const pos = new Float32Array(count * 3);
  const rnd = random(kind);
  for (let k = 0; k < count; k++) {
    pos[k * 3] = rnd() * box.x;
    pos[k * 3 + 1] = rnd() * box.y;
    pos[k * 3 + 2] = rnd() * box.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      centre: { value: new THREE.Vector3() },
      box: { value: box },
      fall: { value: kind === "rain" ? 26 : 2.5 },
      size: { value: kind === "rain" ? 2.0 : 4.0 },
      color: { value: new THREE.Color(kind === "rain" ? "#c7d2de" : "#ffffff") },
    },
    vertexShader: `uniform float time; uniform vec3 centre; uniform vec3 box; uniform float fall; uniform float size;
      void main(){
        vec3 p = position;
        p.y = mod(p.y - time * fall, box.y);
        p.x += sin(time * 0.7 + position.z) * (fall < 5.0 ? 1.5 : 0.2);
        vec3 w = centre - box * 0.5 + mod(p - (centre - box * 0.5), box);
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        // Drops right at the lens would cover the screen: none nearer than 2 m, none huge.
        gl_PointSize = -mv.z < 2.0 ? 0.0 : min(size * (60.0 / -mv.z), size * 3.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 color; void main(){ vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard; gl_FragColor = vec4(color, 0.75); }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

// Several meshes made into one, each with its own colour (for one InstancedMesh per kind).
function merged(parts) {
  const geos = [];
  for (const [geo, color, matrix] of parts) {
    const g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    const c = new THREE.Color(color);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < g.attributes.position.count; k++) cols.set([c.r, c.g, c.b], k * 3);
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let at = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
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

const at = (x, y, z, rx = 0, rz = 0) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)).setPosition(x, y, z);

const KINDS = {
  tree: () => merged([[new THREE.CylinderGeometry(0.3, 0.45, 2.4, 6), "#6b4a2b", at(0, 1.2, 0)], [new THREE.ConeGeometry(2.4, 5.5, 8), "#2f7d32", at(0, 4.6, 0)], [new THREE.ConeGeometry(1.8, 4, 8), "#3a9140", at(0, 6.6, 0)]]),
  pine: () => merged([[new THREE.CylinderGeometry(0.25, 0.4, 2, 6), "#5b3d22", at(0, 1, 0)], [new THREE.ConeGeometry(2.2, 6, 7), "#1f5f3a", at(0, 4.5, 0)], [new THREE.ConeGeometry(1.6, 5, 7), "#24704a", at(0, 7.3, 0)], [new THREE.ConeGeometry(1, 3.5, 7), "#2b7d52", at(0, 9.6, 0)]]),
  palm: () => merged([[new THREE.CylinderGeometry(0.22, 0.35, 8, 6), "#8b6b45", at(0.4, 4, 0, 0, -0.1)], ...[0, 1, 2, 3, 4, 5].map((k) => [new THREE.ConeGeometry(0.6, 4.2, 4), "#3f8f3a", new THREE.Matrix4().makeRotationY((k * Math.PI) / 3).multiply(at(1.4, 7.8, 0, 0, -1.9))])]),
  bush: () => merged([[new THREE.IcosahedronGeometry(1.3, 0), "#3d8b3d", at(0, 0.9, 0)], [new THREE.IcosahedronGeometry(1, 0), "#4a9a44", at(0.9, 0.7, 0.4)]]),
  rock: () => merged([[new THREE.DodecahedronGeometry(1.6, 0), "#8a8580", at(0, 0.8, 0)], [new THREE.DodecahedronGeometry(1, 0), "#9b958f", at(1.2, 0.5, 0.6)]]),
  cactus: () => merged([[new THREE.CylinderGeometry(0.45, 0.5, 5, 7), "#3f7d3a", at(0, 2.5, 0)], [new THREE.CylinderGeometry(0.3, 0.3, 2, 6), "#3f7d3a", at(0.9, 3, 0, 0, 0.0)], [new THREE.CylinderGeometry(0.3, 0.3, 1.2, 6), "#3f7d3a", at(0.55, 2.1, 0, 0, Math.PI / 2)], [new THREE.CylinderGeometry(0.28, 0.28, 1.6, 6), "#3f7d3a", at(-0.85, 3.6, 0, 0, 0)], [new THREE.CylinderGeometry(0.28, 0.28, 1, 6), "#3f7d3a", at(-0.5, 2.9, 0, 0, Math.PI / 2)]]),
  snowpile: () => merged([[new THREE.SphereGeometry(1.8, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), "#ffffff", at(0, -0.2, 0)]]),
  lamp: () => merged([[new THREE.CylinderGeometry(0.12, 0.16, 7, 6), "#4b5563", at(0, 3.5, 0)], [new THREE.BoxGeometry(1.4, 0.15, 0.3), "#4b5563", at(0.6, 7, 0)]]),
};

// The places things may stand: away from every part of the road.
function scatter(track, near, rnd, count, min, max, gap) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 20) {
    tries++;
    const i = Math.floor(rnd() * track.n);
    const side = rnd() < 0.5 ? -1 : 1;
    const off = side * (min + rnd() * rnd() * (max - min));
    const x = track.x[i] + track.nx[i] * off;
    const z = track.z[i] + track.nz[i] * off;
    if (near.find(x, z, 2).dist < gap) continue;
    out.push([x, z]);
  }
  return out;
}

export function buildWorld(scene, track, themeName, renderer) {
  const theme = THEMES[themeName] || THEMES.sunny;
  const rnd = random(track.pack.id);
  const near = new Near(track);
  const objects = [];
  const add = (o) => {
    scene.add(o);
    objects.push(o);
    return o;
  };

  scene.background = new THREE.Color(theme.sky[1]);
  scene.fog = new THREE.Fog(theme.fog[0], theme.fog[1], theme.fog[2]);
  add(skyDome(theme.sky[0], theme.sky[1]));
  add(new THREE.HemisphereLight(theme.sky[0], theme.ground[1], theme.hemi));
  const sun = new THREE.DirectionalLight(theme.sunColor || "#ffffff", theme.sun);
  sun.position.set(300, 600, 200);
  add(sun);

  // The ground, following the road near it.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, avgY = 0;
  for (let i = 0; i < track.n; i++) {
    minX = Math.min(minX, track.x[i]);
    maxX = Math.max(maxX, track.x[i]);
    minZ = Math.min(minZ, track.z[i]);
    maxZ = Math.max(maxZ, track.z[i]);
    avgY += track.y[i] / track.n;
  }
  const margin = 450;
  const sizeX = maxX - minX + 2 * margin;
  const sizeZ = maxZ - minZ + 2 * margin;
  const segX = Math.min(260, Math.round(sizeX / 7));
  const segZ = Math.min(260, Math.round(sizeZ / 7));
  const ground = new THREE.PlaneGeometry(sizeX, sizeZ, segX, segZ);
  ground.rotateX(-Math.PI / 2);
  ground.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const gp = ground.attributes.position;
  const gcol = new Float32Array(gp.count * 3);
  const c1 = new THREE.Color(theme.ground[0]);
  const c2 = new THREE.Color(theme.ground[1]);
  const edge = track.hw + track.shoulder + 1.5;
  const tmp = new THREE.Color();
  for (let k = 0; k < gp.count; k++) {
    const x = gp.getX(k);
    const z = gp.getZ(k);
    const hit = near.find(x, z, 6);
    const hills = theme.hills * (0.5 * Math.sin(x * 0.006 + 1.3) * Math.cos(z * 0.005) + 0.35 * Math.sin(x * 0.013 + z * 0.011) + 0.15 * Math.sin(z * 0.03 - x * 0.02));
    const far = avgY + Math.abs(hills) * (themeName === "mountain" ? 1.0 : 0.6) - 1;
    let y = far;
    if (hit.i >= 0) {
      const roadY = track.y[hit.i] - 0.12;
      y = roadY + (far - roadY) * smooth(edge, edge + 80, hit.dist);
      if (hit.dist < edge) y = roadY;
    }
    if (theme.sea) y += (-6 - y) * smooth(maxZ + 25, maxZ + 140, z);
    gp.setY(k, y);
    tmp.copy(c1).lerp(c2, 0.5 + 0.5 * Math.sin(x * 0.05) * Math.cos(z * 0.045));
    gcol.set([tmp.r, tmp.g, tmp.b], k * 3);
  }
  ground.setAttribute("color", new THREE.BufferAttribute(gcol, 3));
  ground.computeVertexNormals();
  add(new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));

  if (theme.sea) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: "#1e88c7", roughness: 0.15, metalness: 0.35 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -1.6;
    add(sea);
  }

  // The road, its zones (ice, snow, sand, puddles), kerbs, walls and the start.
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTexture(theme.road, rnd),
    roughness: theme.ice ? 0.15 : theme.wet ? 0.3 : 0.85,
    metalness: theme.ice || theme.wet ? 0.25 : 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  add(new THREE.Mesh(loopRibbon(track, -track.hw, track.hw, 0.05, 12), roadMat));
  const zoneColors = { snow: ["#f8fafc", 0.9, 0.9], sand: ["#d7b26e", 0.92, 0.95], puddle: ["#20384f", 0.75, 0.05], ice: ["#cfe8fb", 0.8, 0.1] };
  for (const z of track.pack.zones || []) {
    const [color, opacity, roughness] = zoneColors[z.kind] || zoneColors.sand;
    const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness, metalness: z.kind === "puddle" ? 0.6 : 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    add(new THREE.Mesh(ribbon(track, ((z.from % track.n) + track.n) % track.n, ((z.to % track.n) + track.n) % track.n, -track.hw + 0.6, track.hw - 0.6, 0.06, 10), mat));
  }
  const kerbMat = new THREE.MeshStandardMaterial({ map: stripes("#ffffff", "#dc2626", 2, true), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const c of track.corners) {
    const from = track.wrap(c.from - 6);
    const to = track.wrap(c.to + 6);
    add(new THREE.Mesh(ribbon(track, from, to, track.hw - 0.2, track.hw + 1.1, 0.07, 2.4), kerbMat));
    add(new THREE.Mesh(ribbon(track, from, to, -track.hw - 1.1, -track.hw + 0.2, 0.07, 2.4), kerbMat));
  }
  const wallMat = new THREE.MeshStandardMaterial({ map: stripes(theme.wall[0], theme.wall[1], 2), side: THREE.DoubleSide, roughness: 0.8 });
  for (const side of [1, -1]) add(new THREE.Mesh(wallGeometry(track, side, 0.95), wallMat));

  const checker = canvasTexture(128, 32, (g, w, h) => {
    for (let a = 0; a < 16; a++) for (let b = 0; b < 4; b++) {
      g.fillStyle = (a + b) % 2 ? "#111" : "#fff";
      g.fillRect((a * w) / 16, (b * h) / 4, w / 16, h / 4);
    }
  }, false);
  add(new THREE.Mesh(ribbon(track, 0, 1, -track.hw, track.hw, 0.08, 2), new THREE.MeshStandardMaterial({ map: checker, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
  const gantry = new THREE.Group();
  const post = new THREE.MeshStandardMaterial({ color: "#374151", roughness: 0.6 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), post);
    p.position.set(0, 3.5, s * (track.hw + 1.6));
    gantry.add(p);
  }
  const banner = canvasTexture(512, 64, (g, w, h) => {
    g.fillStyle = "#0f172a";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#f59e0b";
    g.font = "bold 40px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("APEXLINE  ·  極速對決", w / 2, h / 2 + 2);
  }, false);
  // Its banner faces the cars coming (the box's +x and -x sides run across the road).
  const face = new THREE.MeshStandardMaterial({ map: banner });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 2 * track.hw + 4), [face, face, post, post, post, post]);
  beam.position.y = 7;
  gantry.add(beam);
  gantry.position.set(track.x[0], track.y[0], track.z[0]);
  gantry.rotation.y = -Math.atan2(track.tz[0], track.tx[0]);
  add(gantry);

  // Grandstands by the main straight.
  const standMat = new THREE.MeshStandardMaterial({ map: stripes("#9ca3af", "#2563eb", 8, true), roughness: 0.8 });
  for (let k = 0; k < theme.stands; k++) {
    const i = track.wrap(Math.round((k - theme.stands / 2) * 18) + 10);
    const side = k % 2 ? 1 : -1;
    const off = side * (track.hw + track.shoulder + 9);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(30, 7, 9), standMat);
    stand.position.set(track.x[i] + track.nx[i] * off, track.y[i] + 3.5, track.z[i] + track.nz[i] * off);
    stand.rotation.y = -Math.atan2(track.tz[i], track.tx[i]);
    stand.rotation.z = 0;
    add(stand);
  }

  // The things of the place.
  const lights = [];
  for (const [kind, count] of Object.entries(theme.deco)) {
    if (kind === "building") {
      add(buildings(track, near, rnd, count, theme.night));
      continue;
    }
    const spots = kind === "lamp" ? lampSpots(track, theme.night ? 26 : 34) : scatter(track, near, rnd, count, track.hw + track.shoulder + 7, kind === "pine" || kind === "tree" ? 220 : 160, track.hw + track.shoulder + 5);
    const mesh = new THREE.InstancedMesh(KINDS[kind](), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], k) => {
      const y = groundAt(ground, x, z);
      const s = kind === "lamp" ? 1 : 0.7 + rnd() * 0.7;
      m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * Math.PI * 2, 0)), new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(k, m);
    });
    add(mesh);
    if (kind === "lamp") lights.push(...spots);
  }
  if (theme.night) {
    // Lamps all round the track: glowing heads, and real light near the cars (see update).
    const spots = lampSpots(track, 26);
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: "#fff3c4" }), spots.length);
    const pole = new THREE.InstancedMesh(KINDS.lamp(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z, i], k) => {
      m.makeTranslation(x, track.y[i] + 6.9, z);
      bulbs.setMatrixAt(k, m);
      m.makeTranslation(x, track.y[i] - 0.1, z);
      pole.setMatrixAt(k, m);
    });
    add(bulbs);
    add(pole);
    lights.push(...spots);
  }
  const lamps = [];
  if (theme.night) {
    for (let k = 0; k < 8; k++) {
      const l = new THREE.PointLight("#ffe7a8", 900, 70, 1.6);
      add(l);
      lamps.push(l);
    }
  }

  const fall = theme.rain ? add(weather("rain")) : theme.snow ? add(weather("snow")) : null;

  return {
    theme,
    night: !!theme.night,
    // Before each view is drawn: the weather round its camera, the lamps nearest its car lit.
    beforeView(camera, carPos, time) {
      if (fall) {
        fall.material.uniforms.time.value = time;
        fall.material.uniforms.centre.value.copy(camera.position);
      }
      if (lamps.length && lights.length) {
        const order = lights
          .map(([x, z, i]) => [(x - carPos.x) ** 2 + (z - carPos.z) ** 2, x, z, i])
          .sort((a, b) => a[0] - b[0])
          .slice(0, lamps.length);
        order.forEach(([, x, z, i], k) => lamps[k].position.set(x, track.y[i] + 6.5, z));
      }
    },
    dispose() {
      for (const o of objects) {
        scene.remove(o);
        o.traverse?.((c) => {
          c.geometry?.dispose();
          const mats = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
          for (const mat of mats) {
            mat.map?.dispose();
            mat.dispose();
          }
        });
      }
    },
  };
}

function lampSpots(track, every) {
  const out = [];
  const step = Math.max(1, Math.round(every / track.ds));
  for (let i = 0, k = 0; i < track.n; i += step, k++) {
    if (track.open[i]) continue;
    const side = k % 2 ? 1 : -1;
    const off = side * (track.hw + track.shoulder + 1.2);
    out.push([track.x[i] + track.nx[i] * off, track.z[i] + track.nz[i] * off, i]);
  }
  return out;
}

function groundAt(ground, x, z) {
  // Close enough for things standing on it: the nearest vertex of the ground's grid.
  const p = ground.attributes.position;
  const params = ground.parameters;
  const w = params.width;
  const h = params.height;
  const sx = params.widthSegments;
  const sz = params.heightSegments;
  const x0 = p.getX(0);
  const z0 = p.getZ(0);
  const cx = Math.round(((x - x0) / w) * sx);
  const cz = Math.round(((z - z0) / h) * sz);
  const k = Math.max(0, Math.min(sz, cz)) * (sx + 1) + Math.max(0, Math.min(sx, cx));
  return p.getY(k) - 0.1;
}

function buildings(track, near, rnd, count, night) {
  const spots = scatter(track, near, rnd, count, track.hw + track.shoulder + 14, 260, track.hw + track.shoulder + 12);
  const windows = canvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = night ? "#111827" : "#9aa5b1";
    g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 10) for (let x = 4; x < w; x += 12) {
      g.fillStyle = night ? (rnd() < 0.45 ? "#fde68a" : "#1f2937") : rnd() < 0.5 ? "#c7d2de" : "#6b7a89";
      g.fillRect(x, y, 7, 6);
    }
  });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ map: windows, roughness: 0.7, emissive: night ? "#ffffff" : "#000000", emissiveMap: night ? windows : null, emissiveIntensity: night ? 0.55 : 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], k) => {
    const hit = near.find(x, z, 3);
    const y = hit.i >= 0 ? track.y[hit.i] - 0.2 : 0;
    const w = 12 + rnd() * 18;
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * Math.PI, 0)), new THREE.Vector3(w, 12 + rnd() * rnd() * 70, 10 + rnd() * 16));
    mesh.setMatrixAt(k, m);
    mesh.setColorAt(k, new THREE.Color().setHSL(0.58 + rnd() * 0.1, 0.12, 0.55 + rnd() * 0.3));
  });
  return mesh;
}
