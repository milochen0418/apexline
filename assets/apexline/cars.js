// The two cars as seen: a low racing car (it faces +x), wheels that turn and roll, brake lights,
// headlights at night, a soft shadow and a name tag above it.

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

export class CarModel {
  constructor(scene, { color, accent, name, night }) {
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
    box(4.3, 0.5, 1.9, paint, 0, 0.55, 0);
    box(1.4, 0.3, 1.7, paint, 1.35, 0.85, 0);
    box(2.0, 0.55, 1.55, glass, -0.25, 1.05, 0);
    box(1.0, 0.12, 1.75, paint, -0.25, 1.36, 0);
    box(0.35, 0.5, 1.9, dark, -2.05, 1.1, 0);
    box(0.5, 0.08, 2.1, trim, -2.05, 1.4, 0);
    box(0.6, 0.15, 2.0, trim, 2.1, 0.35, 0);
    box(2.6, 0.06, 0.25, trim, 0.2, 0.82, 0);
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
  }

  update(car, dt) {
    const g = this.group;
    g.position.set(car.x, car.y, car.z);
    g.rotation.set(Math.max(-0.08, Math.min(0.08, -car.v * 0.01)), -car.yaw, car.pitch);
    for (const s of this.steerers) s.rotation.y = car.steer;
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
