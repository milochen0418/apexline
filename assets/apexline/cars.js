import * as THREE from "three";
import { Parts, smooth } from "./bodywork.js";
import { paintJob } from "./livery.js";
import { SCHEMES, SHAPES } from "./carshapes.js";
import { wheelParts } from "./wheels.js";

// What the paint reflects: the sky over a dark ground, with a sharp horizon (that line along a car's
// flank is most of what makes it look polished) and the sun.
export function reflections(renderer, theme) {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: new THREE.Color(theme.sky[0]) },
        horizon: { value: new THREE.Color(theme.sky[1]) },
        ground: { value: new THREE.Color(theme.ground[1]).lerp(new THREE.Color("#5b5d62"), 0.65).multiplyScalar(0.6) },
        road: { value: new THREE.Color(theme.road).multiplyScalar(0.7) },
        glow: { value: theme.night ? 0.35 : 1.25 },
      },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; uniform vec3 road; uniform float glow; varying vec3 vDir;
        void main(){
          float h = normalize(vDir).y;
          vec3 sky = mix(horizon * 1.25, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
          vec3 low = mix(ground, road, smoothstep(-0.15, -0.5, h));
          gl_FragColor = vec4(mix(low, sky * glow, smoothstep(-0.006, 0.006, h)), 1.0);
        }`,
    }),
  );
  scene.add(dome);
  const strip = (w, h, x, y, z, power, color = "#ffffff") => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  if (theme.night) {
    for (let k = 0; k < 10; k++) strip(5, 5, Math.cos(k * 0.63) * 36, 18, Math.sin(k * 0.63) * 36, 6, "#ffe7a8");
  } else {
    const sun = new THREE.Vector3(300, 600, 200).normalize().multiplyScalar(44);
    strip(6, 6, sun.x, sun.y, sun.z, 60 * (theme.sun / 2.2), theme.sunColor || "#fff6e8");
    strip(46, 3, 0, 30, 30, 3);
    strip(46, 3, 0, 30, -30, 3);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.012, 0.1, 100);
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return target.texture;
}

function weave() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#17181b";
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? "#26282d" : "#101114";
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

const FAR = 42; // metres from the camera at which a car is drawn coarsely

// A soft shadow on the road, the car's own length and width.
function shadowTexture(long, wide) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  const w = (long / (long + 1.2)) * 256;
  const h = (wide / (wide + 1.2)) * 128;
  g.filter = "blur(9px)";
  g.fillStyle = "#000";
  g.beginPath();
  g.roundRect(128 - w / 2, 64 - h / 2, w, h, 24);
  g.fill();
  return new THREE.CanvasTexture(c);
}

function glowTexture(color) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.18, color);
  r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tag(text, color) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(15,23,42,0.75)";
  g.beginPath();
  g.roundRect(8, 16, 240, 64, 32);
  g.fill();
  g.fillStyle = color;
  g.font = "bold 44px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // The same size on the screen however near or far the car is.
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
  sprite.scale.set(0.085, 0.032, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export class CarModel {
  // shape: which car (carshapes.js); who: "you" or "ai", which of its colours; env: what it reflects
  // (reflections()); no `name`: no tag over it and no lights on the road (a picture of the car).
  constructor(scene, { shape = "gt", who = "you", name = "", accent = "#ffffff", env = null, night = false }) {
    this.scene = scene;
    const def = SHAPES[shape] || SHAPES.gt;
    const scheme = SCHEMES[shape][who];
    const g = (this.group = new THREE.Group());
    g.rotation.order = "YZX";
    // The body moves on its springs; the wheels stay on the road.
    this.body = new THREE.Group();
    g.add(this.body);
    const parts = new Parts();
    def.build(parts);
    const job = paintJob((pass) => def.paint(pass, scheme), scheme.inks, scheme.finishes);
    const shared = { envMap: env, envMapIntensity: 1.15 };
    const materials = {
      paint: new THREE.MeshPhysicalMaterial({ ...shared, map: job.colour, roughnessMap: job.finish, metalnessMap: job.finish, clearcoatMap: job.finish, roughness: 1, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.05, specularIntensity: 0.45, emissive: "#fff4d6", emissiveMap: job.glow, emissiveIntensity: night ? 3 : 0.6 }),
      dark: new THREE.MeshStandardMaterial({ ...shared, color: "#141519", roughness: 0.55, metalness: 0.2 }),
      carbon: new THREE.MeshStandardMaterial({ ...shared, map: weave(), roughness: 0.42, metalness: 0.15, envMapIntensity: 0.6 }),
      chrome: new THREE.MeshStandardMaterial({ ...shared, color: "#e7e9ee", roughness: 0.13, metalness: 1 }),
      floor: new THREE.MeshBasicMaterial({ color: "#050506" }),
      trim: new THREE.MeshStandardMaterial({ ...shared, color: "#2a2b30", roughness: 0.3, metalness: 0.8 }),
      arms: new THREE.MeshStandardMaterial({ ...shared, color: "#2f3136", roughness: 0.35, metalness: 0.7 }),
      matte: new THREE.MeshStandardMaterial({ ...shared, color: "#111216", roughness: 0.8 }),
      gloss: new THREE.MeshStandardMaterial({ ...shared, color: "#0a0c10", roughness: 0.08, metalness: 0.6 }),
      suit: new THREE.MeshStandardMaterial({ ...shared, color: scheme.suit || "#1e293b", roughness: 0.6 }),
      stripe: new THREE.MeshStandardMaterial({ ...shared, color: scheme.suit || "#1e293b", roughness: 0.4 }),
      helmet: new THREE.MeshStandardMaterial({ ...shared, color: scheme.helmet || "#f8fafc", roughness: 0.25 }),
      flap: new THREE.MeshStandardMaterial({ ...shared, color: "#17181c", roughness: 0.75 }),
      tail: new THREE.MeshStandardMaterial({ ...shared, color: "#5b0a0e", emissive: "#ff2020", emissiveIntensity: night ? 1.4 : 0.7, roughness: 0.25 }),
      head: new THREE.MeshStandardMaterial({ ...shared, color: "#dfe7ee", emissive: "#fff4d6", emissiveIntensity: night ? 4 : 0.35, roughness: 0.12, metalness: 0.2 }),
      well: new THREE.MeshBasicMaterial({ color: "#07070a", side: THREE.DoubleSide }),
    };
    this.materials = materials;
    this.textures = [job.colour, job.finish, job.glow];
    materials.far = materials.paint;
    // Near, far, and what shows at any distance. All of the near list goes when the car is small on
    // the screen (facing()), but its lamps.
    this.near = [];
    this.far = [];
    for (const mat of Object.keys(parts.lists)) {
      const mesh = new THREE.Mesh(parts.merged(mat), materials[mat]);
      this.body.add(mesh);
      if (mat === "far") this.far.push(mesh);
      else if (mat !== "tail" && mat !== "head") this.near.push(mesh);
    }
    for (const m of this.far) m.visible = false;

    const w = def.wheels;
    this.wheels = [];
    this.steerers = [];
    this.blurs = [];
    const tyres = new THREE.MeshStandardMaterial({ ...shared, roughness: 0.88 });
    const rims = new THREE.MeshStandardMaterial({ ...shared, vertexColors: true, roughness: 0.28, metalness: 0.9 });
    const calipers = new THREE.MeshStandardMaterial({ ...shared, color: w.style.caliper || "#991b1b", roughness: 0.4, metalness: 0.2 });
    this.blur = new THREE.MeshStandardMaterial({ ...shared, color: w.style.rim, roughness: 0.4, metalness: 0.7, transparent: true, opacity: 0, depthWrite: false });
    this.extras = [tyres, rims, calipers, this.blur];
    for (const [k, [x, z]] of w.at.entries()) {
      const size = k === 0 ? w.front : w.rear;
      const set = wheelParts({ ...w.style, ...size });
      tyres.map ||= set.tyreTexture;
      if (tyres.map !== set.tyreTexture) set.tyreTexture.dispose();
      for (const side of [1, -1]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, size.radius, side * z);
        const facing = new THREE.Group();
        if (side < 0) facing.rotation.y = Math.PI;
        const spin = new THREE.Group();
        const rim = new THREE.Mesh(set.spin, rims);
        const caliper = new THREE.Mesh(set.caliper, calipers);
        spin.add(new THREE.Mesh(set.tyre, tyres), rim);
        const blur = new THREE.Mesh(set.blur, this.blur);
        facing.add(spin, blur, caliper);
        this.near.push(rim, caliper);
        pivot.add(facing);
        g.add(pivot);
        this.wheels.push([spin, side, size.radius]);
        if (k === 0) this.steerers.push(pivot);
      }
    }

    const [long, wide] = def.size;
    this.shadowMap = shadowTexture(long, wide);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(long + 1.2, wide + 1.2),
      new THREE.MeshBasicMaterial({ map: this.shadowMap, color: "#000", transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.045;
    shadow.renderOrder = 1;
    g.add(shadow);
    this.shadow = shadow;

    // The lamps' glow: the tail's when braking, all of them at night.
    this.glows = [];
    this.glowMaps = [glowTexture("rgba(255,40,30,.55)"), glowTexture("rgba(255,236,190,.5)")];
    const glow = (map) => new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
    this.tailGlow = glow(this.glowMaps[0]);
    this.headGlow = glow(this.glowMaps[1]);
    const place = (list, material, size) => {
      for (const [x, y, z] of list) {
        for (const s of z ? [1, -1] : [1]) {
          const sprite = new THREE.Sprite(material);
          sprite.position.set(x, y, s * z);
          sprite.scale.set(size, size, 1);
          this.body.add(sprite);
        }
      }
    };
    place(def.lamps.tail, this.tailGlow, 0.95);
    place(def.lamps.head, this.headGlow, 1.5);
    this.night = night;

    this.label = null;
    if (name) {
      this.label = tag(name, accent);
      this.label.position.set(0, 3.1, 0);
      g.add(this.label);
    }
    if (night && name) {
      for (const z of [0.6, -0.6]) {
        const spot = new THREE.SpotLight("#fff7d6", 900, 90, 0.42, 0.6, 1.6);
        spot.position.set(2.2, 0.7, z);
        spot.target.position.set(30, -2, z * 3);
        g.add(spot);
        g.add(spot.target);
      }
    }
    scene.add(g);
    this.roll = 0;
    this.lean = 0;
    this.dive = 0;
  }

  // `pose`: where to draw the car (Car.pose).
  update(car, dt, pose = car) {
    const g = this.group;
    const ease = 1 - Math.exp(-9 * dt);
    this.lean += (car.side / car.spec.lat - this.lean) * ease;
    this.dive += (car.ax / car.spec.brake - this.dive) * ease;
    g.position.set(pose.x, pose.y + 0.05, pose.z);
    g.rotation.set(0, this.lean * 0.1 - pose.yaw, car.pitch);
    this.body.rotation.set(this.lean * 0.05, 0, this.dive * 0.03);
    this.body.position.y = -0.012 * Math.abs(this.lean);
    for (const s of this.steerers) s.rotation.y = Math.max(-0.5, Math.min(0.5, car.steer + car.turn * 0.3));
    this.roll -= car.u * dt;
    for (const [spin, side, radius] of this.wheels) spin.rotation.z = (side * this.roll) / radius;
    this.blur.opacity = Math.max(0, Math.min(0.92, (Math.abs(car.u) - 9) / 16));
    const braking = car.input && car.input.brake > 0;
    this.materials.tail.emissiveIntensity = braking ? 4 : this.night ? 1.4 : 0.7;
    this.tailShine = braking ? 0.95 : this.night ? 0.35 : 0;
  }

  // Before a view is drawn: lamps shine one way, so their glow shows only from in front of them,
  // and far away a coarse body will do.
  facing(camera) {
    const g = this.group;
    const yaw = -g.rotation.y;
    const dx = camera.position.x - g.position.x;
    const dz = camera.position.z - g.position.z;
    const away = Math.hypot(dx, dz);
    const ahead = (dx * Math.cos(yaw) + dz * Math.sin(yaw)) / (away || 1);
    const far = away > FAR;
    if (far !== this.isFar) {
      this.isFar = far;
      for (const m of this.near) m.visible = !far;
      for (const m of this.far) m.visible = far;
    }
    this.headGlow.opacity = this.night ? 0.8 * smooth(0.15, 0.6, ahead) : 0;
    this.tailGlow.opacity = (this.tailShine || 0) * smooth(0.15, 0.6, -ahead);
  }

  showLabel(on) {
    if (this.label) this.label.visible = on;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((c) => {
      c.geometry?.dispose();
      if (c.material) {
        c.material.map?.dispose();
        c.material.dispose();
      }
    });
    for (const m of Object.values(this.materials)) m.dispose();
    for (const m of this.extras) m.dispose();
    for (const t of [...this.textures, this.shadowMap, ...this.glowMaps]) t.dispose();
    this.materials.carbon.map?.dispose();
  }
}

// ------------------------------------------------------------ pictures of the cars

// The cars in a light room, for the picker: drawn once each by a renderer of their own, one at a
// time so a race never waits for them, and kept for the other races.
const STUDIO = { sky: ["#8ea2bd", "#e8eef5"], ground: ["#3a3f49", "#2a2e36"], road: "#2a2e36", sun: 2.2, sunColor: "#ffffff" };
const pictures = new Map();
const waiting = [];
let room = null;

function drawNext() {
  if (!waiting.length) {
    room.renderer.dispose();
    room.renderer.forceContextLoss();
    room.env.dispose();
    room = null;
    return;
  }
  const [shape, who] = waiting.shift();
  const car = new CarModel(room.scene, { shape, who, env: room.env });
  for (const s of car.steerers) s.rotation.y = who === "you" ? 0.28 : -0.28;
  // Nose to the middle of the picker: yours facing right, the AI's left.
  room.camera.position.set(5.2, 1.45, who === "you" ? 5.3 : -5.3);
  room.camera.lookAt(0, 0.5, 0);
  room.renderer.render(room.scene, room.camera);
  const url = room.renderer.domElement.toDataURL("image/webp", 0.9);
  car.dispose();
  const key = `${shape}.${who}`;
  pictures.set(key, url);
  for (const img of document.querySelectorAll(`img[data-car="${key}"]`)) img.src = url;
  setTimeout(drawNext, 0);
}

export function carPicture(shape, who) {
  const key = `${shape}.${who}`;
  if (pictures.has(key)) return pictures.get(key);
  if (!waiting.some(([s, w]) => s === shape && w === who)) {
    waiting.push([shape, who]);
    if (!room) {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(640, 300, false);
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight("#dfe8f5", "#343843", 1.5));
      const sun = new THREE.DirectionalLight("#ffffff", 2.4);
      sun.position.set(2, 6, 4);
      scene.add(sun);
      room = { renderer, scene, camera: new THREE.PerspectiveCamera(23, 640 / 300, 0.1, 100), env: reflections(renderer, STUDIO) };
      setTimeout(drawNext, 0);
    }
  }
  return null;
}
