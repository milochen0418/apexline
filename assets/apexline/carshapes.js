// The four cars. Each is a body (bodywork.js), its wheels (wheels.js) and its paint job (livery.js):
// `build(parts)` makes the shape, `paint(pass, scheme)` the drawing on it.

import * as THREE from "three";
import { block, bump, curve, placed, plate, smooth, sprayed, tube, turned, wing } from "./bodywork.js";

// A lens facing along the car (`dir` +1 forward, -1 back), `r` wide, domed `d` out of the body.
function lens(x, y, z, r, dir, d = 0.025) {
  const g = turned([[r, -0.04], [r, 0], [r * 0.92, d * 0.4], [r * 0.6, d * 0.85], [0.001, d]], 0, 0, 0, 22);
  return placed(g, x, y, z, 0, (dir * Math.PI) / 2);
}

// A pipe's end: a bright rim and a dark inside, pointing out of the car's tail along -x.
function pipe(parts, x, y, z, r, long = 0.08) {
  parts.add("chrome", placed(turned([[r, 0], [r * 1.04, long * 0.6], [r, long], [r * 0.8, long]], 0, 0, 0, 18), x, y, z, 0, -Math.PI / 2));
  parts.add("dark", placed(new THREE.CircleGeometry(r * 0.82, 16), x - long + 0.012, y, z, 0, -Math.PI / 2));
}

// A mirror on a short arm.
function mirror(parts, x, y, z, wide = 0.095) {
  for (const s of [1, -1]) {
    const shell = new THREE.SphereGeometry(wide, 14, 10);
    shell.scale(1.05, 0.58, 0.82);
    parts.add("paint", sprayed(placed(shell, x, y, s * z)));
    parts.add("dark", tube([[x, y - 0.03, s * (z - 0.2)], [x, y - 0.015, s * (z - 0.06)]], 0.016, { sides: 6 }));
    parts.add("gloss", placed(new THREE.CircleGeometry(wide * 0.74, 14), x - wide * 1.02, y, s * z, 0, -Math.PI / 2, 0, 0.75, 0.8, 1));
  }
}

// A dark well behind each wheel, so nobody sees into the shell, and a box for the floor.
function wells(parts, arches, inner, outer) {
  for (const a of arches) {
    const well = new THREE.CylinderGeometry(a.r - 0.004, a.r - 0.004, outer - inner, 28, 1, true, Math.PI * 0.5, Math.PI);
    well.rotateX(Math.PI / 2);
    well.scale(-1, 1, 1);
    for (const side of [1, -1]) {
      const g = well.clone();
      g.translate(a.x, a.y, (side * (inner + outer)) / 2);
      parts.add("well", g);
      const wall = new THREE.CircleGeometry(a.r, 28, 0, Math.PI);
      wall.translate(a.x, a.y, side * inner);
      parts.add("well", wall);
    }
  }
}

// ------------------------------------------------------------ Apex GT: the long-nosed grand tourer

const gt = (() => {
  const FRONT = 1.38;
  const REAR = -1.28;
  const arches = [{ x: FRONT, y: 0.335, r: 0.405 }, { x: REAR, y: 0.335, r: 0.415 }];
  const top = curve([[-2.2, 0.9], [-2.1, 0.965], [-1.9, 0.945], [-1.3, 0.93], [-0.4, 0.9], [0.6, 0.865], [1.3, 0.765], [1.9, 0.64], [2.28, 0.5]]);
  const waist = curve([[-2.2, 0.68], [-1.3, 0.69], [-0.2, 0.62], [1.2, 0.62], [2.28, 0.4]]);
  const low = curve([[-2.2, 0.32], [-1.75, 0.25], [-1.3, 0.2], [1.3, 0.175], [2, 0.16], [2.28, 0.19]]);
  const width = curve([[-2.2, 0.8], [-1.85, 0.945], [-1.3, 0.985], [-0.6, 0.93], [0.25, 0.905], [FRONT, 0.965], [1.9, 0.9], [2.28, 0.74]]);
  const roof = curve([[-2.1, 0.86], [-1.6, 0.98], [-1.05, 1.11], [-0.5, 1.195], [-0.1, 1.205], [0.22, 1.13], [0.55, 0.985], [0.92, 0.8]]);
  const cabinWide = curve([[-2.1, 0.3], [-1.6, 0.56], [-0.9, 0.705], [-0.2, 0.72], [0.4, 0.705], [1, 0.6]]);
  const BELT = 0.88;

  return {
    wheels: {
      front: { radius: 0.345, width: 0.27 },
      rear: { radius: 0.355, width: 0.31 },
      style: { spokes: 5, twin: 0.1, gapIn: 0.075, gapOut: 0.05, rimRadius: 0.245, hub: 0.05, rim: "#c9ccd2", lip: "#d8dadf", nut: "#dc2626", tread: "groove", wall: "APEXLINE GT", caliper: "#b91c1c" },
      at: [[FRONT, 0.84], [REAR, 0.85]],
    },
    size: [4.5, 1.97],
    lamps: { tail: [[-2.24, 0.72, 0.4]], head: [[2.1, 0.66, 0.66]] },

    build(parts) {
      parts.skin({
        from: -2.2, to: 2.28, arches, caps: [[0.13, 2.6], [0.3, 2.3]], rows: 28,
        at: (x) => ({ top: top(x), waist: waist(x), low: low(x), width: width(x), foot: width(x) - 0.08, upper: 3.2, lower: 2.4 }),
        shape: ([x, y, z]) => {
          const w = width(x);
          const out = Math.abs(z) / w;
          const fender = (0.055 * bump(x, FRONT, 0.7) + 0.05 * bump(x, REAR, 0.72)) * smooth(0.42, 0.8, out) * smooth(0.45, 0.62, y);
          const hood = 0.022 * smooth(0.3, 0.5, x) * (1 - smooth(1.7, 2.0, x)) * (1 - smooth(0.22, 0.34, out));
          const cove = 0.03 * bump(x, 0.0, 0.8) * bump(y, 0.44, 0.17);
          return [x, y + fender + hood, z - Math.sign(z) * cove];
        },
      });
      parts.skin({
        from: -2.1, to: 0.92, rows: 16, lip: 0,
        at: (x) => ({ top: roof(x), waist: Math.min(BELT, roof(x) - 0.03), low: 0.7, width: cabinWide(x), foot: cabinWide(x) - 0.02, upper: 3.2, lower: 2 }),
      }, 0.8);
      parts.add("floor", block(3.6, 0.36, 1.06, -0.15, 0.37, 0, 0.04));
      wells(parts, arches, 0.54, 0.99);
      // Below: a splitter, sills, a diffuser with its fins.
      parts.add("dark", plate([[2.24, 0.158], [2.24, 0.142], [1.76, 0.142], [1.76, 0.158]], 1.5));
      for (const s of [1, -1]) parts.add("carbon", block(1.72, 0.05, 0.1, 0.03, 0.17, s * 0.86, 0.015));
      parts.add("carbon", plate([[-2.12, 0.33], [-2.17, 0.22], [-1.75, 0.2], [-1.75, 0.24]], 1.36));
      for (const z of [-0.2, -0.07, 0.07, 0.2]) parts.add("dark", plate([[-2.16, 0.31], [-2.19, 0.19], [-1.8, 0.2]], 0.016, z));
      for (const s of [1, -1]) for (const z of [0.43, 0.6]) pipe(parts, -2.13, 0.27, s * z, 0.05, 0.06);
      mirror(parts, 0.46, 0.985, 0.93);
      parts.add("dark", tube([[0.67, 0.925, 0.5], [0.58, 0.965, -0.05]], 0.008, { sides: 5 }));
      parts.add("dark", tube([[0.67, 0.925, -0.05], [0.58, 0.965, -0.58]], 0.008, { sides: 5 }));
      // Two round lamps a side, each a ring round a small one.
      for (const s of [1, -1]) {
        for (const [x, z] of [[-2.2, 0.28], [-2.185, 0.53]]) {
          parts.add("trim", placed(turned([[0.13, 0], [0.13, 0.02], [0.112, 0.02], [0.112, 0.005]], 0, 0, 0, 24), x, 0.72, s * z, 0, -Math.PI / 2));
          parts.add("tail", placed(turned([[0.106, 0.012], [0.078, 0.02], [0.056, 0.012]], 0, 0, 0, 24), x, 0.72, s * z, 0, -Math.PI / 2));
          parts.add("tail", lens(x, 0.72, s * z, 0.034, -1, 0.016));
        }
      }
    },

    paint(d, s) {
      d.plan("top", () => {
        const shield = [];
        for (let k = 0; k <= 12; k++) {
          const x = 0.72 - (k / 12) * 0.56;
          shield.push([x, cabinWide(x) - 0.1]);
        }
        const screen = [...shield, ...shield.slice().reverse().map(([x, z]) => [x, -z])];
        const back = [];
        for (let k = 0; k <= 12; k++) {
          const x = -0.66 - (k / 12) * 1.08;
          back.push([x, (cabinWide(x) - 0.12) * (1 - 0.1 * (k / 12))]);
        }
        const rear = [...back, ...back.slice().reverse().map(([x, z]) => [x, -z])];
        for (const z of [-0.3, 0.16]) d.rect(-2.4, z, 4.8, 0.14, "stripe");
        d.poly(screen, "glass");
        d.poly(rear, "glass");
        for (const z of [0.42, -0.42]) {
          for (let k = 0; k < 4; k++) d.rect(1.24 + k * 0.075, z - 0.1 + k * 0.012, 0.04, 0.2 - k * 0.024, "matte", 0.01);
        }
        for (const z of [1, -1]) {
          d.poly([[2.17, z * 0.46], [2.08, z * 0.8], [1.84, z * 0.84], [1.7, z * 0.74], [1.98, z * 0.56]], "lens");
          d.poly([[2.17, z * 0.46], [2.08, z * 0.8], [1.84, z * 0.84], [1.7, z * 0.74], [1.98, z * 0.56], [2.17, z * 0.46]], "chrome", 0.009);
          d.disc(1.98, z * 0.7, 0.06, "lamp");
          d.disc(2.07, z * 0.62, 0.042, "lamp");
          d.poly([[1.76, z * 0.74], [1.9, z * 0.8], [2.02, z * 0.78]], "lamp", 0.014);
        }
      });
      d.sides(() => {
        const glass = [[0.5, BELT + 0.012]];
        for (let k = 0; k <= 16; k++) {
          const x = 0.5 - (k / 16) * 1.72;
          glass.push([x, roof(x) - 0.1 - (k > 11 ? (k - 11) * 0.016 : 0) - Math.max(0, x - 0.1) * 0.12]);
        }
        glass.push([-1.3, BELT + 0.015]);
        d.poly(glass, "glass");
        d.poly(glass.concat([glass[0]]), "chrome", 0.01);
        d.rect(-0.46, BELT, 0.05, 0.3, "matte");
        d.rect(-2.4, 0, 4.8, 0.245, "matte");
        d.poly([[0.42, 0.9], [0.5, 0.6], [0.44, 0.27]], "seam", 0.008);
        d.poly([[-0.72, 0.9], [-0.82, 0.6], [-0.74, 0.27]], "seam", 0.008);
        d.rect(-0.62, 0.77, 0.15, 0.022, "chrome", 0.01);
        d.poly([[0.86, 0.7], [0.62, 0.68], [0.6, 0.46], [0.82, 0.42]], "matte");
        for (let k = 0; k < 3; k++) d.poly([[0.84, 0.64 - k * 0.07], [0.61, 0.63 - k * 0.07]], "paint", 0.018);
        d.poly([[-2.3, 0.7], [-1.2, 0.695], [0, 0.67], [0.9, 0.68], [2.3, 0.58]], "stripe", 0.028);
        d.shade(arches, 0.2);
        d.disc(-0.12, 0.47, 0.155, "stripe");
        d.text(s.number, -0.12, 0.465, s.number.length > 1 ? 0.15 : 0.22, "ink", { italic: false });
        d.text("APEX", 0.12, 0.33, 0.07, "stripe", { align: "left" });
      });
      d.plan("rear", () => {
        d.rect(-0.75, 0.57, 1.5, 0.3, "satin", 0.06);
        d.rect(-0.28, 0.4, 0.56, 0.14, "plate", 0.015);
        d.text(s.plate, 0, 0.468, 0.09, "ink", { italic: false, font: "Arial, sans-serif", weight: "700" });
        d.rect(-1.2, 0, 2.4, 0.37, "matte");
      });
      d.plan("front", () => {
        const g = d.g;
        g.beginPath();
        g.ellipse(0, 0.36, 0.48, 0.12, 0, 0, Math.PI * 2);
        g.fillStyle = d.ink("mesh");
        g.fill();
        g.lineWidth = 0.016;
        g.strokeStyle = d.ink("chrome");
        g.stroke();
        d.colour(() => {
          g.save();
          g.beginPath();
          g.ellipse(0, 0.36, 0.47, 0.11, 0, 0, Math.PI * 2);
          g.clip();
          g.strokeStyle = "rgba(150,150,160,.5)";
          g.lineWidth = 0.005;
          for (let k = -30; k < 30; k++) {
            g.beginPath();
            g.moveTo(k * 0.035, 0.2);
            g.lineTo(k * 0.035 + 0.28, 0.55);
            g.moveTo(k * 0.035 + 0.28, 0.2);
            g.lineTo(k * 0.035, 0.55);
            g.stroke();
          }
          g.restore();
        });
        d.rect(-1.2, 0, 2.4, 0.2, "matte");
        d.disc(0, 0.53, 0.045, "stripe");
      });
    },
  };
})();

// ------------------------------------------------------------ Hornet: a small open single-seater

const hornet = (() => {
  const FRONT = 1.5;
  const REAR = -1.28;
  const top = curve([[-1.95, 0.56], [-1.5, 0.66], [-0.9, 0.82], [-0.5, 0.9], [-0.25, 0.86], [0.1, 0.72], [0.6, 0.66], [1.2, 0.56], [1.8, 0.42], [2.26, 0.31]]);
  const waist = curve([[-1.95, 0.4], [-0.5, 0.42], [0.8, 0.38], [2.26, 0.22]]);
  const low = curve([[-1.95, 0.22], [-1.3, 0.14], [1.2, 0.13], [2.26, 0.16]]);
  const width = curve([[-1.95, 0.14], [-1.4, 0.26], [-0.6, 0.38], [0.2, 0.42], [0.9, 0.3], [1.5, 0.21], [2.26, 0.15]]);
  const cockpit = (x, z) => Math.hypot((x - 0.32) / 0.56, z / 0.27);
  const podTop = curve([[-1.32, 0.34], [-0.9, 0.46], [-0.1, 0.56], [0.28, 0.56], [0.42, 0.5]]);
  const podWide = curve([[-1.32, 0.05], [-1.0, 0.16], [-0.3, 0.27], [0.25, 0.28], [0.42, 0.26]]);

  return {
    wheels: {
      front: { radius: 0.325, width: 0.26 },
      rear: { radius: 0.345, width: 0.33 },
      style: { spokes: 6, gapIn: 0.1, gapOut: 0.08, rimRadius: 0.235, hub: 0.06, rim: "#caa23a", lip: "#d4d4d8", nut: "#111114", tread: "slick", wall: "HORNET SLICK", caliper: "#111114" },
      at: [[FRONT, 0.8], [REAR, 0.83]],
    },
    size: [4.3, 1.95],
    lamps: { tail: [[-2.02, 1.03, 0.73], [-2.03, 0.34, 0]], head: [[2.16, 0.31, 0.12]] },

    build(parts) {
      parts.skin({
        from: -1.95, to: 2.26, step: 0.04, rows: 30, caps: [[0.08, 2.4], [0.14, 2.2]],
        at: (x) => ({ top: top(x), waist: waist(x), low: low(x), width: width(x), foot: width(x) - 0.05, upper: 2.6, lower: 3 }),
        shape: ([x, y, z]) => {
          const rho = cockpit(x, z);
          const hole = 1 - smooth(0.8, 0.98, rho);
          const rim = 0.018 * bump(rho, 1.03, 0.14);
          return [x, y + rim - hole * 0.42 * smooth(0.3, 0.5, y), z];
        },
      }, 0.5, (x, z) => (cockpit(x, z) < 1 ? "top" : null));
      // Side pods.
      parts.skin({
        from: -1.32, to: 0.42, rows: 16, step: 0.06, caps: [null, [0.05, 3]],
        at: (x) => ({ top: podTop(x), waist: 0.36, low: 0.15, width: podWide(x), foot: podWide(x) - 0.03, upper: 3, lower: 3 }),
        shape: ([x, y, z]) => [x, y, z + 0.33],
      });
      parts.add("carbon", block(1.72, 0.03, 1.16, -0.42, 0.145, 0, 0.01));
      // The driver and the seat.
      parts.add("matte", block(0.34, 0.5, 0.42, -0.12, 0.66, 0, 0.1));
      const helmet = new THREE.SphereGeometry(0.145, 20, 16);
      helmet.scale(1.1, 1, 0.95);
      parts.add("helmet", placed(helmet, 0.02, 0.86, 0));
      const visor = new THREE.SphereGeometry(0.149, 20, 10, Math.PI - 1.05, 2.1, 1.12, 0.52);
      parts.add("gloss", placed(visor, 0.02, 0.86, 0, 0, 0, 0, 1.1, 1, 0.95));
      parts.add("stripe", placed(new THREE.SphereGeometry(0.149, 8, 16, 0, Math.PI * 2, 0, Math.PI), 0.02, 0.86, 0, 0, 0, 0, 1.1, 1, 0.1));
      parts.add("suit", placed(new THREE.SphereGeometry(0.2, 12, 10), 0.0, 0.67, 0, 0, 0, 0, 0.8, 0.5, 1.0));
      parts.add("dark", tube([[0.55, 0.68, -0.14], [0.55, 0.66, 0], [0.55, 0.68, 0.14]], 0.022, { sides: 6 }));
      // The hoop over the head, with the air scoop above it.
      parts.add("chrome", tube([[-0.3, 0.72, -0.24], [-0.3, 1.02, -0.19], [-0.3, 1.13, 0], [-0.3, 1.02, 0.19], [-0.3, 0.72, 0.24]], 0.026, { sides: 8 }));
      parts.add("dark", plate([[-0.26, 0.98], [-0.26, 0.82], [-0.5, 0.86]], 0.12, 0));
      parts.add("carbon", tube([[-0.72, 0.74, 0], [-0.3, 0.9, 0]], (t) => 0.06 + 0.07 * t, { sides: 12 }));
      // Front wing: main plane, a flap, end plates.
      parts.add("carbon", wing(0.34, 0.05, 1.86, 2.1, 0.17, 0.06));
      parts.add("paint", sprayed(wing(0.2, 0.035, 1.84, 1.93, 0.235, 0.32), 0.5));
      for (const s of [1, -1]) parts.add("paint", sprayed(plate([[2.3, 0.1], [2.3, 0.22], [2.15, 0.3], [1.78, 0.33], [1.78, 0.12]], 0.02, s * 0.94)));
      parts.add("dark", tube([[1.98, 0.3, 0], [2.0, 0.21, 0]], 0.03, { sides: 8 }));
      // Rear wing: two planes between tall plates on two struts.
      parts.add("paint", sprayed(wing(0.36, 0.06, 1.44, -1.63, 1.04, 0.14), 0.3));
      parts.add("paint", sprayed(wing(0.2, 0.04, 1.42, -1.82, 1.13, 0.5), 0.3));
      for (const s of [1, -1]) {
        parts.add("paint", sprayed(plate([[-1.38, 0.84], [-1.38, 1.14], [-1.5, 1.23], [-1.98, 1.23], [-1.98, 0.84]], 0.022, s * 0.73)));
        parts.add("dark", tube([[-1.5, 0.56, s * 0.18], [-1.62, 1.03, s * 0.3]], 0.016, { sides: 6 }));
        // Tail lamps in the plates.
        parts.add("tail", block(0.03, 0.26, 0.03, -1.985, 1.03, s * 0.73, 0.008));
      }
      parts.add("tail", block(0.03, 0.05, 0.16, -1.995, 0.34, 0, 0.012));
      parts.add("carbon", plate([[-1.86, 0.26], [-1.98, 0.21], [-1.25, 0.14], [-1.25, 0.2]], 0.6));
      for (const z of [-0.2, -0.07, 0.07, 0.2]) parts.add("dark", plate([[-1.92, 0.25], [-1.99, 0.2], [-1.5, 0.15]], 0.012, z));
      // Pipes up high over the gearbox.
      pipe(parts, -1.86, 0.53, 0.09, 0.044, 0.1);
      pipe(parts, -1.86, 0.53, -0.09, 0.044, 0.1);
      // Wishbones out to the wheels.
      for (const s of [1, -1]) {
        for (const [wx, in1, in2] of [[FRONT, 1.2, 1.72], [REAR, -1.05, -1.5]]) {
          for (const y of [0.24, 0.46]) {
            parts.add("arms", tube([[in1, y, s * 0.14], [wx, y + 0.02, s * 0.66]], 0.013, { sides: 6 }));
            parts.add("arms", tube([[in2, y, s * 0.12], [wx, y + 0.02, s * 0.66]], 0.013, { sides: 6 }));
          }
        }
      }
      for (const s of [1, -1]) {
        parts.add("head", lens(2.12, 0.3, s * 0.1, 0.036, 1, 0.012));
        parts.add("head", lens(2.0, 0.34, s * 0.13, 0.03, 1, 0.012));
      }
    },

    paint(d, s) {
      d.plan("top", () => {
        // Hornet's bands over the engine, in chevrons.
        const band = (x, thick, sweep) => {
          const z = width(x) * 0.55;
          d.poly([[x, -z], [x + thick, -z], [x + thick + sweep, 0], [x + thick, z], [x, z], [x + sweep, 0]], "stripe");
        };
        for (let k = 0; k < 6; k++) band(-1.72 + k * 0.26, 0.13, 0.15);
        for (let k = 0; k < 5; k++) band(0.98 + k * 0.26, 0.11, 0.13);
        d.disc(0.32, 0, 0.53, "matte", 0.25);
      });
      d.sides(() => {
        d.rect(-2.4, 0, 4.8, 0.2, "stripe");
        d.text("HORNET", -0.5, 0.38, 0.13, "ink");
        d.disc(1.08, 0.36, 0.1, "stripe");
        d.text(s.number, 1.08, 0.355, s.number.length > 1 ? 0.1 : 0.14, "paint", { italic: false });
        d.text("蜂鳥", 0.62, 0.34, 0.085, "ink", { italic: false });
        // On the tall plates of the rear wing.
        d.rect(-2.0, 0.82, 0.64, 0.17, "stripe");
        d.text(s.number, -1.7, 1.1, 0.13, "ink", { italic: false });
      });
      d.plan("rear", () => {
        d.rect(-0.3, 0.3, 0.6, 0.3, "matte", 0.04);
      });
      d.plan("front", () => {
        // The mouths of the side pods.
        for (const z of [0.47, -0.47]) d.rect(z - 0.12, 0.24, 0.24, 0.24, "matte", 0.05);
      });
    },
  };
})();

// ------------------------------------------------------------ Bison: the big American muscle car

const bison = (() => {
  const FRONT = 1.42;
  const REAR = -1.3;
  const arches = [{ x: FRONT, y: 0.36, r: 0.41 }, { x: REAR, y: 0.38, r: 0.45 }];
  const top = curve([[-2.26, 1.0], [-2.14, 1.03], [-1.85, 0.99], [-1.5, 0.98], [-0.7, 0.97], [0.5, 0.965], [1.4, 0.93], [2.3, 0.87]]);
  const waist = curve([[-2.26, 0.82], [-1.5, 0.81], [-0.7, 0.72], [0.4, 0.7], [1.4, 0.72], [2.3, 0.7]]);
  const low = curve([[-2.26, 0.3], [-1.5, 0.26], [0, 0.23], [1.5, 0.21], [2.3, 0.3]]);
  const width = curve([[-2.26, 0.92], [-1.8, 0.985], [-1.3, 1.02], [-0.7, 0.95], [0.5, 0.94], [FRONT, 0.975], [2.3, 0.93]]);
  const roof = curve([[-1.75, 0.92], [-1.3, 1.02], [-0.85, 1.25], [-0.55, 1.34], [-0.2, 1.365], [0.12, 1.33], [0.68, 1.04], [0.95, 0.9]]);
  const cabinWide = curve([[-1.75, 0.76], [-0.9, 0.75], [-0.2, 0.73], [0.6, 0.76], [1, 0.72]]);
  const BELT = 0.98;

  return {
    wheels: {
      front: { radius: 0.35, width: 0.27 },
      rear: { radius: 0.385, width: 0.42 },
      style: { spokes: 5, gapIn: 0.2, gapOut: 0.2, rimRadius: 0.235, hub: 0.075, dish: 0.09, rim: "#d6d3cb", lip: "#efede6", nut: "#efede6", tread: "groove", wall: "BISON  BISON", wallInk: "#d8d4c8", caliper: "#3f3f46" },
      at: [[FRONT, 0.84], [REAR, 0.82]],
    },
    size: [4.6, 2.04],
    lamps: { tail: [[-2.29, 0.765, 0.53]], head: [[2.33, 0.7, 0.57]] },

    build(parts) {
      parts.skin({
        from: -2.26, to: 2.3, arches, caps: [[0.07, 3.5], [0.09, 3.5]], rows: 28,
        at: (x) => ({ top: top(x), waist: waist(x), low: low(x), width: width(x), foot: width(x) - 0.07, upper: 4.6, lower: 3 }),
        shape: ([x, y, z]) => {
          const out = Math.abs(z) / width(x);
          const crest = 0.025 * bump(out, 0.72, 0.16) * smooth(0.4, 0.8, x);
          const bulge = 0.04 * bump(y, 0.62, 0.3) * bump(x, REAR, 0.62);
          return [x, y + crest, z + Math.sign(z) * bulge];
        },
      });
      parts.skin({
        from: -1.75, to: 0.95, rows: 16, lip: 0,
        at: (x) => ({ top: roof(x), waist: Math.min(BELT, roof(x) - 0.03), low: 0.8, width: cabinWide(x), foot: cabinWide(x), upper: 4.2, lower: 2 }),
      }, 0.8);
      parts.add("floor", block(3.9, 0.46, 1.1, 0, 0.47, 0, 0.04));
      wells(parts, arches, 0.56, 1.0);
      // Chrome bumpers.
      for (const x of [2.33, -2.29]) {
        const dir = Math.sign(x);
        const bar = [];
        for (let k = -6; k <= 6; k++) {
          const z = (k / 6) * 0.98;
          bar.push([x - dir * 0.2 * Math.pow(Math.abs(k / 6), 4), 0.42, z]);
        }
        parts.add("chrome", tube(bar, 0.058, { sides: 10 }));
      }
      // The blower through the bonnet, with its stacks.
      parts.add("trim", block(0.66, 0.1, 0.34, 0.98, 1.0, 0, 0.03));
      parts.add("chrome", block(0.58, 0.05, 0.3, 0.98, 1.065, 0, 0.02));
      parts.add("dark", block(0.72, 0.03, 0.42, 0.98, 0.955, 0, 0.012));
      for (const x of [0.76, 0.98, 1.2]) {
        for (const z of [-0.09, 0.09]) {
          parts.add("trim", placed(turned([[0.044, 0.125], [0.044, 0], [0.052, 0], [0.056, 0.05], [0.074, 0.125], [0.066, 0.13]], 0, 0, 0, 14), x, 1.085, z, -Math.PI / 2));
          parts.add("dark", placed(new THREE.CircleGeometry(0.046, 14), x, 1.19, z, -Math.PI / 2));
        }
      }
      // Side pipes along the sills.
      for (const s of [1, -1]) {
        parts.add("chrome", tube([[0.78, 0.5, s * 0.92], [0.7, 0.34, s * 1.01], [0.45, 0.25, s * 1.03], [-0.85, 0.25, s * 1.03]], 0.05, { sides: 12 }));
        parts.add("dark", placed(new THREE.CircleGeometry(0.043, 14), -0.86, 0.25, s * 1.03, 0, -Math.PI / 2));
      }
      // A small lip on the boot, louvres over the rear window (sprayed), wipers.
      mirror(parts, 0.52, 1.1, 0.87, 0.085);
      parts.add("chrome", tube([[0.85, 1.02, 0.5], [0.76, 1.06, -0.05]], 0.009, { sides: 5 }));
      parts.add("chrome", tube([[0.85, 1.02, -0.05], [0.76, 1.06, -0.58]], 0.009, { sides: 5 }));
      for (const s of [1, -1]) {
        // Three upright bars a side at the back.
        for (let k = 0; k < 3; k++) parts.add("tail", block(0.03, 0.24, 0.12, -2.25, 0.765, s * (0.36 + k * 0.165), 0.012));
        // Round lamps in pairs at the front.
        for (const z of [0.44, 0.7]) {
          parts.add("chrome", placed(turned([[0.11, 0], [0.11, 0.022], [0.092, 0.022], [0.092, 0.008]], 0, 0, 0, 22), 2.28, 0.7, s * z, 0, Math.PI / 2));
          parts.add("head", lens(2.285, 0.7, s * z, 0.092, 1, 0.022));
        }
      }
    },

    paint(d, s) {
      d.plan("top", () => {
        for (const z of [-0.33, 0.1]) d.rect(-2.4, z, 4.8, 0.23, "stripe");
        for (const z of [-0.37, 0.34]) d.rect(-2.4, z, 4.8, 0.022, "stripe");
        const shield = [];
        for (let k = 0; k <= 8; k++) {
          const x = 0.72 - (k / 8) * 0.56;
          shield.push([x, cabinWide(x) - 0.09]);
        }
        d.poly([...shield, ...shield.slice().reverse().map(([x, z]) => [x, -z])], "glass");
        d.rect(-1.27, -0.6, 0.65, 1.2, "glass", 0.06);
        // Louvres over the rear window.
        for (let k = 0; k < 8; k++) d.rect(-1.27 + k * 0.085, -0.62, 0.058, 1.24, "matte", 0.008);
        d.rect(0.72, -0.26, 0.56, 0.52, "matte", 0.03);
      });
      d.sides(() => {
        const glass = [[0.66, BELT + 0.012]];
        for (let k = 0; k <= 12; k++) {
          const x = 0.66 - (k / 12) * 1.6;
          glass.push([x, roof(x) - 0.1 - Math.max(0, x - 0.1) * 0.1]);
        }
        glass.push([-0.98, BELT + 0.012]);
        d.poly(glass, "glass");
        d.poly(glass.concat([glass[0]]), "chrome", 0.016);
        d.rect(-0.48, BELT, 0.05, 0.4, "matte");
        // The hip's long stripe, a scoop before the rear wheel, the door.
        d.poly([[-0.76, 0.58], [-0.62, 0.42], [-0.72, 0.28], [-0.92, 0.3], [-0.9, 0.54]], "matte");
        d.poly([[-2.3, 0.86], [-1.5, 0.86], [-0.6, 0.76], [0.4, 0.74], [1.4, 0.76], [2.3, 0.72]], "stripe", 0.05);
        d.poly([[-2.3, 0.82], [-1.5, 0.82], [-0.6, 0.72], [0.4, 0.7], [1.4, 0.72], [2.3, 0.68]], "stripe", 0.012);
        d.rect(-2.4, 0, 4.8, 0.285, "matte");
        d.shade(arches, 0.26);
        d.poly([[0.52, 0.98], [0.56, 0.6], [0.5, 0.3]], "seam", 0.009);
        d.poly([[-0.62, 0.98], [-0.6, 0.72]], "seam", 0.009);
        d.rect(-0.5, 0.82, 0.16, 0.026, "chrome", 0.01);
        d.text("BISON", 0.05, 0.53, 0.17, "stripe");
        d.text(s.number, 0.86, 0.5, 0.09, "stripe", { italic: false });
      });
      d.plan("rear", () => {
        d.rect(-0.95, 0.61, 1.9, 0.31, "satin", 0.03);
        d.poly([[-0.95, 0.61], [0.95, 0.61], [0.95, 0.92], [-0.95, 0.92], [-0.95, 0.61]], "chrome", 0.012);
        d.text("BISON", 0, 0.765, 0.085, "chromeink", { wide: 0.04 });
        d.rect(-0.26, 0.48, 0.52, 0.11, "plate", 0.012);
        d.text(s.plate, 0, 0.535, 0.075, "ink", { italic: false, font: "Arial, sans-serif", weight: "700" });
      });
      d.plan("front", () => {
        d.rect(-0.9, 0.56, 1.8, 0.3, "mesh", 0.04);
        const g = d.g;
        d.colour(() => {
          g.fillStyle = "rgba(220,220,225,.28)";
          for (let k = -24; k <= 24; k++) g.fillRect(k * 0.036, 0.57, 0.008, 0.28);
          for (let k = 0; k < 7; k++) g.fillRect(-0.9, 0.57 + k * 0.045, 1.8, 0.006);
        });
        d.text("BISON", 0, 0.71, 0.09, "stripe");
      });
    },
  };
})();

// ------------------------------------------------------------ Red Fox: the wide rally hatch

const fox = (() => {
  const FRONT = 1.3;
  const REAR = -1.32;
  const arches = [{ x: FRONT, y: 0.36, r: 0.42 }, { x: REAR, y: 0.36, r: 0.425 }];
  const top = curve([[-2.0, 0.98], [-1.5, 1.02], [-0.6, 1.0], [0.6, 0.97], [1.3, 0.9], [1.95, 0.77], [2.12, 0.7]]);
  const waist = curve([[-2.0, 0.8], [-1.3, 0.7], [0, 0.66], [1.3, 0.66], [2.12, 0.5]]);
  const low = curve([[-2.0, 0.34], [-1.3, 0.25], [1.3, 0.23], [2.12, 0.22]]);
  const box = (x, at) => smooth(0.63, 0.53, Math.abs(x - at));
  const baseWidth = curve([[-2.0, 0.85], [-1.7, 0.92], [-1, 0.93], [0.6, 0.92], [1.5, 0.91], [2.12, 0.8]]);
  const width = (x) => baseWidth(x) + 0.09 * box(x, FRONT) + 0.095 * box(x, REAR);
  const roof = curve([[-1.96, 0.98], [-1.7, 1.2], [-1.36, 1.35], [-0.9, 1.43], [-0.4, 1.45], [0.0, 1.41], [0.42, 1.22], [0.78, 1.0], [1.0, 0.9]]);
  const cabinWide = curve([[-2.0, 0.66], [-1.2, 0.76], [-0.2, 0.77], [0.6, 0.76], [1, 0.72]]);
  const BELT = 1.02;

  return {
    wheels: {
      front: { radius: 0.355, width: 0.3 },
      rear: { radius: 0.36, width: 0.31 },
      style: { spokes: 8, gapIn: 0.1, gapOut: 0.1, rimRadius: 0.235, hub: 0.05, rim: "#f4f1e8", lip: "#f4f1e8", nut: "#111114", tread: "knobbly", wall: "RALLY FOX", caliper: "#f59e0b" },
      at: [[FRONT, 0.9], [REAR, 0.9]],
    },
    size: [4.2, 2.06],
    lamps: { tail: [[-2.03, 0.78, 0.66]], head: [[2.18, 0.74, 0.37]] },

    build(parts) {
      parts.skin({
        from: -2.0, to: 2.12, arches, caps: [[0.05, 3.2], [0.13, 2.8]], rows: 34, step: 0.05,
        at: (x) => ({ top: top(x), waist: waist(x), low: low(x), width: width(x), foot: width(x) - 0.05, upper: 3.8, lower: 3.4 }),
        shape: ([x, y, z]) => {
          const flare = smooth(0.62, 0.82, y);
          return [x, y, z - Math.sign(z) * flare * 0.09 * Math.max(box(x, FRONT), box(x, REAR))];
        },
      });
      parts.skin({
        from: -2.0, to: 1.0, rows: 16, lip: 0,
        at: (x) => ({ top: roof(x), waist: Math.min(BELT, roof(x) - 0.03), low: 0.85, width: cabinWide(x), foot: cabinWide(x), upper: 3.8, lower: 2 }),
      }, 0.8, (x, z) => (x < -1.1 && Math.abs(z) < 0.56 ? "top" : null)); // the whole hatch, or its glass frays
      parts.add("floor", block(3.3, 0.42, 1.1, -0.15, 0.46, 0, 0.04));
      wells(parts, arches, 0.56, 1.02);
      // A scoop on the bonnet and one on the roof.
      parts.add("paint", sprayed(plate([[1.2, 0.97], [0.62, 1.06], [0.56, 0.98], [1.2, 0.9]], 0.5), 0.3));
      parts.add("dark", plate([[1.195, 0.965], [1.205, 0.91], [1.0, 0.94], [1.0, 0.98]], 0.46));
      parts.add("paint", sprayed(plate([[-0.75, 1.5], [-0.28, 1.51], [-0.28, 1.46], [-0.75, 1.44]], 0.3), 0.3));
      parts.add("dark", plate([[-0.27, 1.5], [-0.27, 1.45], [-0.3, 1.45], [-0.3, 1.5]], 0.27));
      // The big wing on two struts, and a lip at the top of the hatch.
      parts.add("paint", sprayed(wing(0.44, 0.08, 1.92, -1.82, 1.5, 0.1), 0.3));
      for (const s of [1, -1]) {
        parts.add("paint", sprayed(plate([[-1.6, 1.44], [-1.6, 1.55], [-1.68, 1.59], [-2.06, 1.59], [-2.06, 1.44]], 0.016, s * 0.965)));
        parts.add("dark", plate([[-1.62, 1.2], [-1.52, 1.2], [-1.74, 1.48], [-1.82, 1.48]], 0.03, s * 0.52));
        // Mud flaps.
        parts.add("flap", block(0.012, 0.3, 0.36, REAR - 0.46, 0.21, s * 0.85, 0.004));
        parts.add("flap", block(0.012, 0.28, 0.33, FRONT - 0.46, 0.2, s * 0.85, 0.004));
      }
      // A rack of four lamps across the nose.
      for (const z of [-0.54, -0.2, 0.2, 0.54]) {
        parts.add("dark", placed(turned([[0.082, 0], [0.082, 0.065], [0.072, 0.065], [0.072, 0.02]], 0, 0, 0, 20), 2.08, 0.74, z, 0, Math.PI / 2));
        parts.add("head", lens(2.14, 0.74, z, 0.072, 1, 0.018));
      }
      parts.add("dark", tube([[2.09, 0.74, -0.72], [2.09, 0.74, 0.72]], 0.012, { sides: 6 }));
      // The big single pipe.
      pipe(parts, -2.0, 0.3, 0.6, 0.075, 0.14);
      mirror(parts, 0.55, 1.13, 0.9, 0.09);
      parts.add("carbon", plate([[2.16, 0.24], [2.16, 0.2], [1.75, 0.2], [1.75, 0.24]], 1.84));
      parts.add("carbon", plate([[-1.97, 0.34], [-2.03, 0.24], [-1.7, 0.25], [-1.7, 0.3]], 1.5));
      parts.add("dark", tube([[0.95, 1.05, 0.45], [0.83, 1.1, -0.1]], 0.008, { sides: 5 }));
      parts.add("dark", tube([[0.95, 1.05, -0.1], [0.83, 1.1, -0.65]], 0.008, { sides: 5 }));
      for (const s of [1, -1]) {
        // Tall lamps up the corners of the hatch.
        parts.add("tail", block(0.03, 0.26, 0.17, -2.0, 0.78, s * 0.66, 0.016));
        parts.add("head", block(0.03, 0.05, 0.1, 2.07, 0.44, s * 0.74, 0.012));
      }
    },

    paint(d, s) {
      d.plan("top", () => {
        // A fox's mask on the bonnet: white cheeks and a dark nose.
        d.poly([[2.2, 0.0], [2.12, 0.68], [1.5, 0.7], [1.16, 0.4], [1.5, 0.2], [1.82, 0.0], [1.5, -0.2], [1.16, -0.4], [1.5, -0.7], [2.12, -0.68]], "belly");
        d.poly([[2.2, 0], [2.02, 0.11], [1.9, 0], [2.02, -0.11]], "matte");
        for (const z of [0.5, -0.5]) d.poly([[1.66, z * 0.66], [1.36, z * 1.2], [1.3, z * 0.96]], "ink");
        const shield = [];
        for (let k = 0; k <= 8; k++) {
          const x = 0.86 - (k / 8) * 0.6;
          shield.push([x, cabinWide(x) - 0.09]);
        }
        d.poly([...shield, ...shield.slice().reverse().map(([x, z]) => [x, -z])], "glass");
        d.poly([[-1.26, -0.5], [-1.26, 0.5], [-1.76, 0.42], [-1.76, -0.42]], "glass");
        // Number on the roof.
        d.g.save();
        d.g.translate(-0.65, 0);
        d.g.rotate(Math.PI / 2);
        d.text(s.number, 0, 0, s.number.length > 1 ? 0.42 : 0.56, "belly", { italic: false });
        d.g.restore();
      });
      d.sides(() => {
        const glass = [[0.62, BELT + 0.02]];
        for (let k = 0; k <= 12; k++) {
          const x = 0.62 - (k / 12) * 1.92;
          glass.push([x, roof(x) - 0.12 - Math.max(0, x - 0.1) * 0.12 - Math.max(0, -x - 0.9) * 0.18]);
        }
        glass.push([-1.36, BELT + 0.03]);
        d.poly(glass, "glass");
        d.rect(-0.42, BELT, 0.06, 0.45, "matte");
        d.poly([[-1.04, BELT], [-0.94, BELT], [-0.98, 1.5], [-1.1, 1.5]], "paint");
        // White belly, swept up in shards towards the rear.
        d.poly([[2.3, 0.0], [2.3, 0.5], [1.2, 0.5], [0.8, 0.44], [0.45, 0.6], [0.3, 0.42], [-0.1, 0.62], [-0.2, 0.42], [-0.65, 0.68], [-0.72, 0.42], [-2.3, 0.42], [-2.3, 0]], "belly");
        d.rect(-2.4, 0, 4.8, 0.27, "matte");
        d.shade(arches, 0.24);
        d.poly([[0.5, 1.02], [0.54, 0.62], [0.5, 0.28]], "seam", 0.009);
        d.poly([[-0.8, 1.02], [-0.84, 0.62], [-0.8, 0.28]], "seam", 0.009);
        d.rect(-0.7, 0.86, 0.14, 0.024, "matte", 0.01);
        // Rivets on the flares.
        for (const at of [FRONT, REAR]) {
          for (let k = 0; k <= 8; k++) {
            const a = (k / 8) * Math.PI;
            d.disc(at + Math.cos(a) * 0.5, 0.36 + Math.sin(a) * 0.5, 0.012, "chrome");
          }
        }
        d.disc(0.0, 0.8, 0.14, "belly");
        d.text(s.number, 0.0, 0.795, s.number.length > 1 ? 0.15 : 0.2, "ink", { italic: false });
        d.text("RED FOX", -0.4, 0.34, 0.09, "ink");
      });
      d.plan("rear", () => {
        d.rect(-1.2, 0, 2.4, 0.42, "belly");
        d.rect(-1.2, 0, 2.4, 0.3, "matte");
        d.poly([[-0.72, 1.0], [0.72, 1.0], [0.8, 0.52], [-0.8, 0.52], [-0.72, 1.0]], "seam", 0.01);
        d.text("RED FOX", 0, 0.86, 0.1, "belly");
        d.rect(-0.26, 0.56, 0.52, 0.13, "plate", 0.012);
        d.text(s.plate, 0, 0.625, 0.085, "ink", { italic: false, font: "Arial, sans-serif", weight: "700" });
      });
      d.plan("front", () => {
        d.rect(-1.2, 0, 2.4, 0.5, "belly");
        d.rect(-1.2, 0, 2.4, 0.26, "matte");
        d.rect(-0.62, 0.53, 1.24, 0.1, "mesh", 0.02);
        d.rect(-0.8, 0.29, 1.6, 0.13, "matte", 0.02);
      });
    },
  };
})();

const BASE = { glass: "#0a0f15", matte: "#0d0e10", gloss: "#08090b", satin: "#121317", chrome: "#d9dbe0", mesh: "#08080a", lens: "#c9d8e6", lamp: "#ffffff", plate: "#e8e6df", chromeink: "#d9dbe0" };
const FINISHES = { stripe: "paint", ink: "paint", seam: "paint", belly: "paint", chromeink: "chrome", plate: "satin" };

// Each car in the colours of who drives it: warm for you, cool for the AI (the race's red and blue),
// so two of the same car are told apart too.
export const SCHEMES = {
  gt: {
    you: { number: "7", plate: "APX 007", inks: { ...BASE, paint: "#8f0a14", stripe: "#f4efe2", ink: "#16171a", seam: "#3d060c" }, finishes: { ...FINISHES, paint: "paint" } },
    ai: { number: "AI", plate: "AI 0001", inks: { ...BASE, paint: "#0d3a96", stripe: "#e3eefc", ink: "#10203f", seam: "#071d4e" }, finishes: { ...FINISHES, paint: "paint" } },
  },
  hornet: {
    you: { number: "3", helmet: "#f8fafc", suit: "#b91c1c", inks: { ...BASE, paint: "#f2b200", stripe: "#131316", ink: "#131316", seam: "#7a5a00" }, finishes: { ...FINISHES, paint: "paint" } },
    ai: { number: "AI", helmet: "#111827", suit: "#0f4c81", inks: { ...BASE, paint: "#0ea5c9", stripe: "#0b1220", ink: "#0b1220", seam: "#075468" }, finishes: { ...FINISHES, paint: "paint" } },
  },
  bison: {
    you: { number: "44", plate: "BSN 044", inks: { ...BASE, paint: "#6a3a18", stripe: "#efe6cf", ink: "#16171a", seam: "#2b1708" }, finishes: { ...FINISHES, paint: "metallic" } },
    ai: { number: "AI", plate: "AI 0003", inks: { ...BASE, paint: "#0e3a7a", stripe: "#bfe0ff", ink: "#0a1a33", seam: "#04122a" }, finishes: { ...FINISHES, paint: "metallic" } },
  },
  fox: {
    you: { number: "21", plate: "FOX 021", inks: { ...BASE, paint: "#c9440b", belly: "#f6efe2", stripe: "#f6efe2", ink: "#17171a", seam: "#6a2206" }, finishes: { ...FINISHES, paint: "paint" } },
    ai: { number: "AI", plate: "AI 0004", inks: { ...BASE, paint: "#2277d6", belly: "#eef5fb", stripe: "#eef5fb", ink: "#0c2340", seam: "#123f73" }, finishes: { ...FINISHES, paint: "paint" } },
  },
};

export const SHAPES = { gt, hornet, bison, fox };
