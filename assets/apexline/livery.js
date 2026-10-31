// The cars' paint: a canvas per car and driver, drawn as a set of plans of the car (its right and
// left sides, top, front and rear; bodywork.js says where each lies), and wrapped on it from
// outside. A drawing is made three times with different inks: once for colour, once for what the
// surface is like (red: clear coat, green: roughness, blue: metal) and once for what glows.

import * as THREE from "three";
import { SHEET } from "./bodywork.js";

const X0 = -SHEET.len / 2;
const Z0 = -SHEET.wide / 2;

// What each kind of surface is like: [clear coat, roughness, metal], 0 to 1.
const FINISH = {
  paint: [0.7, 0.5, 0.08],
  metallic: [0.6, 0.4, 0.55],
  satin: [0.2, 0.5, 0.3],
  gloss: [1, 0.25, 0],
  matte: [0, 0.75, 0],
  rubber: [0, 0.9, 0],
  glass: [1, 0.06, 0.35],
  chrome: [0, 0.14, 1],
  lens: [1, 0.08, 0.5],
  mesh: [0, 0.6, 0.3],
};

const css = ([r, g, b]) => `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;

const FONT = '"Arial Black", "Helvetica Neue", Impact, Arial, sans-serif';

// One go over the sheet. `inks` turns an ink's name into this pass's colour.
class Pass {
  constructor(g, scale, inks, kind) {
    this.g = g;
    this.scale = scale;
    this.inks = inks;
    this.kind = kind; // colour, finish or glow
    this.mirror = false;
  }

  // Draw on one plan of the car: x along the car (or z across it, on the front and rear) and y up
  // (z down the sheet, on the top) in metres.
  plan(name, fn) {
    const g = this.g;
    const S = SHEET.S * this.scale;
    const r = SHEET[name];
    const ox = r.x * this.scale;
    const oy = r.y * this.scale;
    const w = r.w * this.scale;
    const h = r.h * this.scale;
    g.save();
    g.beginPath();
    g.rect(ox, oy, w, h);
    g.clip();
    this.mirror = false;
    if (name === "right") g.setTransform(S, 0, 0, -S, ox - X0 * S, oy + SHEET.tall * S);
    else if (name === "left") {
      g.setTransform(-S, 0, 0, -S, ox + w + X0 * S, oy + SHEET.tall * S);
      this.mirror = true;
    } else if (name === "top") g.setTransform(S, 0, 0, S, ox - X0 * S, oy - Z0 * S);
    else if (name === "front") {
      g.setTransform(-S, 0, 0, -S, ox + w + Z0 * S, oy + SHEET.tall * S);
      this.mirror = true;
    } else g.setTransform(S, 0, 0, -S, ox - Z0 * S, oy + SHEET.tall * S);
    this.flipY = name !== "top";
    fn(this, name);
    g.restore();
  }

  sides(fn) {
    this.plan("right", fn);
    this.plan("left", fn);
  }

  fillPlan(ink) {
    const g = this.g;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = this.ink(ink);
    g.fillRect(0, 0, this.g.canvas.width, this.g.canvas.height);
    g.restore();
  }

  ink(name) {
    return this.inks(name);
  }

  poly(points, ink, stroke = 0) {
    const g = this.g;
    g.beginPath();
    points.forEach(([a, b], k) => (k ? g.lineTo(a, b) : g.moveTo(a, b)));
    if (stroke) {
      g.strokeStyle = this.ink(ink);
      g.lineWidth = stroke;
      g.lineJoin = "round";
      g.lineCap = "round";
      g.stroke();
    } else {
      g.closePath();
      g.fillStyle = this.ink(ink);
      g.fill();
    }
  }

  rect(a, b, w, h, ink, round = 0) {
    const g = this.g;
    g.beginPath();
    g.roundRect(a, b, w, h, round);
    g.fillStyle = this.ink(ink);
    g.fill();
  }

  disc(a, b, r, ink, ry = r) {
    const g = this.g;
    g.beginPath();
    g.ellipse(a, b, r, ry, 0, 0, Math.PI * 2);
    g.fillStyle = this.ink(ink);
    g.fill();
  }

  // Words, the right way round on any plan, `size` metres tall; `angle` turns them.
  text(words, a, b, size, ink, { align = "center", angle = 0, weight = "900", italic = true, font = FONT, wide = 0 } = {}) {
    if (this.kind === "glow") return;
    const g = this.g;
    g.save();
    g.translate(a, b);
    g.rotate(angle);
    g.scale((this.mirror ? -1 : 1) / 100, (this.flipY ? -1 : 1) / 100);
    g.font = `${italic ? "italic " : ""}${weight} ${size * 100}px ${font}`;
    g.textAlign = align;
    g.textBaseline = "middle";
    if (wide && "letterSpacing" in g) g.letterSpacing = `${wide * 100}px`;
    g.fillStyle = this.ink(ink);
    g.fillText(words, 0, 0);
    g.restore();
  }

  // Colour only (shading, soft shadows, wear).
  colour(fn) {
    if (this.kind === "colour") fn(this.g);
  }

  // A soft dark ring round each wheel arch and along the sill, where a real body catches no light.
  shade(arches, sill) {
    this.colour((g) => {
      for (const a of arches) {
        const glow = g.createRadialGradient(a.x, a.y, a.r * 0.95, a.x, a.y, a.r * 1.42);
        glow.addColorStop(0, "rgba(0,0,0,0.5)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = glow;
        g.fillRect(a.x - a.r * 1.5, a.y - a.r * 1.5, a.r * 3, a.r * 3);
      }
      const under = g.createLinearGradient(0, sill, 0, sill + 0.22);
      under.addColorStop(0, "rgba(0,0,0,0.42)");
      under.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = under;
      g.fillRect(-2.5, sill, 5, 0.22);
    });
  }
}

const SCALES = { colour: 1, finish: 0.5, glow: 0.25 };

function sheet(kind) {
  const c = document.createElement("canvas");
  c.width = Math.round(SHEET.w * SCALES[kind]);
  c.height = Math.round(SHEET.h * SCALES[kind]);
  return c;
}

// Draws `paint(pass)` three times; `colours` names the car's inks, `finishes` what each one is like.
export function paintJob(paint, colours, finishes = {}) {
  const passes = {
    colour: (name) => colours[name] ?? colours.paint,
    finish: (name) => css(FINISH[finishes[name] ?? name] ?? FINISH[finishes.paint ?? "paint"]),
    glow: (name) => (name === "lamp" || finishes[name] === "lamp" ? "#ffffff" : "#000000"),
  };
  const out = {};
  for (const [kind, inks] of Object.entries(passes)) {
    const c = sheet(kind);
    const g = c.getContext("2d");
    const pass = new Pass(g, SCALES[kind], inks, kind);
    pass.fillPlan("paint");
    paint(pass);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = kind === "colour" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = 4;
    out[kind] = tex;
  }
  return out;
}
