// What is drawn over the two views: each driver's place, laps, times and speed, the AI's plan,
// the race clock and countdown, a map with both cars, and the panels (before the start, paused,
// the result). Plain DOM over the canvas; words come from the page (labels).

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function clock(secs) {
  if (!Number.isFinite(secs)) return "—";
  const m = Math.floor(secs / 60);
  const s = secs - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function fill(text, values) {
  return String(text || "").replace(/\{(\w+)\}/g, (_, k) => (values[k] ?? ""));
}

class View {
  constructor(parent, cls, name, accent) {
    this.el = h("div", { class: `ax-view ${cls}` });
    this.name = h("span", { class: "ax-name", style: `color:${accent}` }, name);
    this.place = h("span", { class: "ax-place" });
    this.lap = h("div", { class: "ax-lap" });
    this.times = h("div", { class: "ax-times" });
    this.speed = h("span", { class: "ax-kmh" }, "0");
    this.warn = h("div", { class: "ax-warn" });
    this.flashEl = h("div", { class: "ax-flash" });
    this.extra = h("div", { class: "ax-extra" });
    this.el.append(
      h("div", { class: "ax-top" }, h("div", { class: "ax-who" }, this.place, this.name), this.lap, this.times),
      h("div", { class: "ax-speed" }, this.speed, h("small", {}, "km/h")),
      this.warn,
      this.flashEl,
      this.extra,
    );
    parent.append(this.el);
    this.flashUntil = 0;
  }
}

export class Hud {
  constructor(root, labels, names) {
    this.t = labels || {};
    this.root = h("div", { class: "ax-hud" });
    this.you = new View(this.root, "ax-you", names.you, "#fca5a5");
    this.ai = new View(this.root, "ax-ai", names.ai, "#93c5fd");
    this.plan = h("div", { class: "ax-plan" });
    this.ai.extra.append(this.plan);
    this.clockEl = h("div", { class: "ax-clock" });
    this.count = h("div", { class: "ax-count" });
    this.map = h("canvas", { class: "ax-map", width: 220, height: 150 });
    this.divider = h("div", { class: "ax-divider" });
    this.pauseBtn = h("button", { class: "ax-pause-btn", title: "Esc" }, "❚❚");
    this.root.append(this.divider, this.clockEl, this.count, this.map, this.pauseBtn);
    this.panelEl = h("div", { class: "ax-panel" });
    root.append(this.root, this.panelEl);
    this.lastText = 0;
  }

  layout(stacked) {
    this.root.classList.toggle("ax-stacked", stacked);
  }

  drawMap(track, cars) {
    const g = this.map.getContext("2d");
    if (!this.mapShape) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < track.n; i++) {
        minX = Math.min(minX, track.x[i]);
        maxX = Math.max(maxX, track.x[i]);
        minZ = Math.min(minZ, track.z[i]);
        maxZ = Math.max(maxZ, track.z[i]);
      }
      const pad = 10;
      const scale = Math.min((this.map.width - 2 * pad) / (maxX - minX), (this.map.height - 2 * pad) / (maxZ - minZ));
      const ox = (this.map.width - (maxX - minX) * scale) / 2;
      const oz = (this.map.height - (maxZ - minZ) * scale) / 2;
      this.mapShape = { at: (x, z) => [ox + (x - minX) * scale, oz + (z - minZ) * scale] };
    }
    const { at } = this.mapShape;
    g.clearRect(0, 0, this.map.width, this.map.height);
    g.lineWidth = 5;
    g.lineJoin = "round";
    g.strokeStyle = "rgba(226,232,240,0.85)";
    g.beginPath();
    for (let i = 0; i <= track.n; i += 2) {
      const [x, y] = at(track.x[i % track.n], track.z[i % track.n]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
    const [sx, sy] = at(track.x[0], track.z[0]);
    g.fillStyle = "#f59e0b";
    g.fillRect(sx - 3, sy - 3, 6, 6);
    for (const [car, color] of cars) {
      const [x, y] = at(car.x, car.z);
      g.fillStyle = color;
      g.strokeStyle = "#0f172a";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 5.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  // Every frame; the words only a few times a second.
  update(s, now) {
    for (const [view, me] of [[this.you, s.you], [this.ai, s.ai]]) {
      view.speed.textContent = String(Math.max(0, Math.round(me.kmh)));
      if (now > view.flashUntil) view.flashEl.textContent = "";
      view.warn.textContent = me.wrongWay ? this.t.wrong_way || "WRONG WAY" : "";
    }
    if (now - this.lastText < 120) return;
    this.lastText = now;
    for (const [view, me] of [[this.you, s.you], [this.ai, s.ai]]) {
      view.place.textContent = me.place === 1 ? this.t.place_1 || "1st" : this.t.place_2 || "2nd";
      view.place.className = `ax-place ${me.place === 1 ? "ax-first" : ""}`;
      view.lap.textContent = me.done ? this.t.finished || "Finished" : `${this.t.lap || "Lap"} ${Math.min(me.lap, s.laps)} / ${s.laps}`;
      view.times.textContent = `${this.t.this_lap || "This lap"} ${clock(me.lapTime)} · ${this.t.best_lap || "Best"} ${clock(me.best)}`;
    }
    this.clockEl.textContent = s.racing || s.over ? clock(s.time) : "";
  }

  flash(which, text, now) {
    const view = which === "ai" ? this.ai : this.you;
    view.flashEl.textContent = text;
    view.flashUntil = now + 900;
  }

  setPlan(node) {
    this.plan.replaceChildren(node);
  }

  countdown(text) {
    this.count.textContent = text || "";
    this.count.classList.toggle("ax-go", text === (this.t.go || "GO!"));
  }

  panel(node) {
    this.panelEl.replaceChildren(...(node ? [node] : []));
    this.panelEl.classList.toggle("ax-open", !!node);
  }

  dispose() {
    this.root.remove();
    this.panelEl.remove();
  }
}
