// The cars as seen (each faces +x): four shapes, wheels that turn and roll, brake lights,
// headlights at night, a soft shadow and a name tag above it. The body leans on its springs and
// its nose points a little into a turn, for the eye only (SuperTuxKart's skid "visual"): the
// corners read from the car, not from a number.

import * as THREE from "three";

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
  sprite.position.set(0, 3.1, 0);
  sprite.renderOrder = 10;
  return sprite;
}

const SHAPES = {
  // A low coupe with a wing.
  gt(box, { paint, dark, glass, trim }) {
    box(4.3, 0.5, 1.9, paint, 0, 0.55, 0);
    box(1.4, 0.3, 1.7, paint, 1.35, 0.85, 0);
    box(2.0, 0.55, 1.55, glass, -0.25, 1.05, 0);
    box(1.0, 0.12, 1.75, paint, -0.25, 1.36, 0);
    box(0.35, 0.5, 1.9, dark, -2.05, 1.1, 0);
    box(0.5, 0.08, 2.1, trim, -2.05, 1.4, 0);
    box(0.6, 0.15, 2.0, trim, 2.1, 0.35, 0);
    box(2.6, 0.06, 0.25, trim, 0.2, 0.82, 0);
  },
  // A small open car: the driver's helmet shows.
  hornet(box, { paint, dark, trim }) {
    box(4.2, 0.42, 1.8, paint, 0, 0.5, 0);
    box(1.5, 0.26, 1.5, paint, 1.2, 0.76, 0);
    box(1.1, 0.5, 1.25, dark, -0.45, 0.82, 0);
    box(0.5, 0.48, 0.5, trim, -0.45, 1.25, 0);
    box(0.7, 0.42, 1.5, paint, -1.5, 0.85, 0);
    box(0.5, 0.08, 1.95, trim, -2.0, 1.2, 0);
    box(0.5, 0.12, 2.0, trim, 2.05, 0.32, 0);
  },
  // A long bonnet, a tall cabin, two stripes.
  bison(box, { paint, dark, glass, trim }) {
    box(4.3, 0.62, 2.0, paint, 0, 0.62, 0);
    box(1.9, 0.2, 1.75, paint, 1.15, 1.02, 0);
    box(0.7, 0.16, 0.8, dark, 1.15, 1.16, 0);
    box(1.7, 0.6, 1.6, glass, -0.65, 1.2, 0);
    box(1.4, 0.1, 1.65, paint, -0.7, 1.54, 0);
    box(4.32, 0.04, 0.34, trim, 0, 0.94, 0.3);
    box(4.32, 0.04, 0.34, trim, 0, 0.94, -0.3);
    box(0.35, 0.16, 2.0, dark, -2.0, 1.0, 0);
    box(0.5, 0.2, 2.05, dark, 2.05, 0.42, 0);
  },
  // A wide hatch with a tall wing and side skirts.
  fox(box, { paint, dark, glass, trim }) {
    box(4.3, 0.46, 2.0, paint, 0, 0.52, 0);
    box(1.2, 0.26, 1.75, paint, 1.4, 0.84, 0);
    box(1.9, 0.52, 1.6, glass, -0.35, 1.02, 0);
    box(1.5, 0.1, 1.65, paint, -0.4, 1.32, 0);
    box(0.5, 0.08, 2.35, trim, -1.95, 1.62, 0);
    box(0.25, 0.6, 0.12, dark, -1.95, 1.3, 0.75);
    box(0.25, 0.6, 0.12, dark, -1.95, 1.3, -0.75);
    box(3.0, 0.12, 2.12, trim, 0, 0.3, 0);
  },
};

export class CarModel {
  constructor(scene, { color, accent, name, night, shape = "gt" }) {
    this.scene = scene;
    const g = (this.group = new THREE.Group());
    g.rotation.order = "YZX";
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.1, metalness: 0.6 });
    const trim = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4 });
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    const look = SHAPES[shape] || SHAPES.gt;
    look(box, { paint, dark, glass, trim });
    this.brake = new THREE.MeshStandardMaterial({ color: "#7f1d1d", emissive: "#ef4444", emissiveIntensity: 0.4 });
    box(0.06, 0.18, 0.45, this.brake, -2.16, 0.7, 0.62);
    box(0.06, 0.18, 0.45, this.brake, -2.16, 0.7, -0.62);
    const lamp = new THREE.MeshStandardMaterial({ color: "#fef9c3", emissive: "#fef9c3", emissiveIntensity: night ? 2 : 0.4 });
    box(0.06, 0.15, 0.4, lamp, 2.16, 0.62, 0.6);
    box(0.06, 0.15, 0.4, lamp, 2.16, 0.62, -0.6);

    const tyre = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 14);
    tyre.rotateX(Math.PI / 2);
    const rubber = new THREE.MeshStandardMaterial({ color: "#18181b", roughness: 0.9 });
    const rim = new THREE.MeshStandardMaterial({ color: "#a1a1aa", roughness: 0.3, metalness: 0.7 });
    this.wheels = [];
    this.steerers = [];
    for (const [x, z] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.38, z);
      const wheel = new THREE.Mesh(tyre, rubber);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8).rotateX(Math.PI / 2), rim);
      wheel.add(hub);
      pivot.add(wheel);
      g.add(pivot);
      this.wheels.push(wheel);
      if (x > 0) this.steerers.push(pivot);
    }
    this.label = tag(name, accent);
    g.add(this.label);

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(2.7, 1.3, 1);
    shadow.position.y = 0.04;
    g.add(shadow);

    if (night) {
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
    g.position.set(pose.x, pose.y, pose.z);
    g.rotation.set(this.lean * 0.07, this.lean * 0.1 - pose.yaw, car.pitch + this.dive * 0.035);
    for (const s of this.steerers) s.rotation.y = Math.max(-0.5, Math.min(0.5, car.steer + car.turn * 0.3));
    this.roll -= (car.u * dt) / 0.38;
    for (const w of this.wheels) w.rotation.z = this.roll;
    this.brake.emissiveIntensity = car.input && car.input.brake > 0 ? 2.5 : 0.4;
  }

  showLabel(on) {
    this.label.visible = on;
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
  }
}
