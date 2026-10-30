// The driving line, as in Forza: the racing line painted on the road ahead of your car, coloured
// by your speed right now. Cyan: fine at this speed. Yellow: the brakes are coming. Red: the speed
// here is lower than yours, so be down to it by then. Corners stop being a surprise, and red
// marks the place to brake. Drawn in your view only; L hides it. (Cyan, not Forza's green: Forza's
// players who can't tell red from green keep asking for this.)

import * as THREE from "three";

const POINTS = 120; // along the line ahead
const HALF = 0.6; // metres each side of the line
const LIFT = 0.1; // above the road
const SOON = 0.8; // seconds of yellow before the red
const SLACK = 0.5; // m/s over the speed that still counts as fine
const FINE = new THREE.Color("#22d3ee");
const NEAR = new THREE.Color("#facc15");
const OVER = new THREE.Color("#ef4444");

export class Guide {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    const g = (this.geometry = new THREE.BufferGeometry());
    this.position = new THREE.BufferAttribute(new Float32Array(POINTS * 6), 3);
    this.color = new THREE.BufferAttribute(new Float32Array(POINTS * 8), 4);
    this.position.setUsage(THREE.DynamicDrawUsage);
    this.color.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", this.position);
    g.setAttribute("color", this.color);
    const index = [];
    for (let k = 0; k < POINTS - 1; k++) {
      const a = k * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(index);
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  // `target`: how fast the car should be going at each point (Driver.target).
  update(car, target) {
    const tr = this.track;
    const speed = Math.hypot(car.u, car.v);
    const first = car.i + 2;
    let red = POINTS;
    for (let k = 0; k < POINTS; k++) {
      if (target[(first + k) % tr.n] < speed - SLACK) {
        red = k;
        break;
      }
    }
    const yellow = red - Math.ceil((speed * SOON) / tr.ds);
    for (let k = 0; k < POINTS; k++) {
      const i = (first + k) % tr.n;
      const [x, z] = tr.point(i, tr.line[i]);
      const y = tr.y[i] + LIFT;
      this.position.setXYZ(k * 2, x + tr.nx[i] * HALF, y, z + tr.nz[i] * HALF);
      this.position.setXYZ(k * 2 + 1, x - tr.nx[i] * HALF, y, z - tr.nz[i] * HALF);
      const c = target[i] < speed - SLACK ? OVER : k >= yellow && k < red ? NEAR : FINE;
      const dash = i % 6 < 4 ? 1 : 0.3;
      const alpha = 0.72 * dash * Math.min(1, k / 8) * Math.min(1, (POINTS - k) / 30);
      this.color.setXYZW(k * 2, c.r, c.g, c.b, alpha);
      this.color.setXYZW(k * 2 + 1, c.r, c.g, c.b, alpha);
    }
    this.position.needsUpdate = true;
    this.color.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.mesh.material.dispose();
  }
}
