// A race: you (red, left) against the AI (blue, right), each seen from behind its own car.
//
// Before the start the AI studies the track: the AI Hub's model is asked for its plan (a speed
// for every corner and how hard to race you: planner.js), and the briefing shows it thinking.
// Its car is then driven by that plan (driver.js); after each of its laps the model hears how
// every corner went and may change the plan for the next lap. The cars can knock into each
// other and into the walls (physics.js). You pick your car and the AI's (garage.js; the model
// plans for the car it is given, so a new car means a new plan) and the AI's level, and the
// steering help and the driving line (guide.js) can be switched off. At the end: who won, the
// times, and every plan the AI made next to what the grip allowed its car in each corner.
//
// The page (race.jsx) passes {track, backend, labels, lang, opponent, onEvent}; onEvent hears
// {type: "finished", result} and {type: "leave"}. window.__apexline is this game, for tests
// (its `auto` lets the AI's driving drive your car too).

import * as THREE from "three";
import { CarModel, carPicture, reflections } from "./cars.js";
import { Driver, LEVELS, Telemetry, cautiousPlan, cornerLimit, gripPlan } from "./driver.js";
import { CARS, carSpec, carStats } from "./garage.js";
import { Guide } from "./guide.js";
import { Hud, clock, fill, h } from "./hud.js";
import { Input } from "./input.js";
import { Car, STEP, Track, angleDiff, clamp, collide } from "./physics.js";
import { Planner } from "./planner.js";
import { buildWorld } from "./scenery.js";
import { Sound } from "./sound.js";

const GRACE = 25; // seconds the other car has to finish after the first one did
const PLAYER_OFF = 2.6; // the grid: you on the left, the AI on the right
const LINE_SHARE = 0.97; // the driving line's speeds: this share of what the grip allows
const CAM_TURN = 5.5; // per second: how fast the camera comes round after the car
const KEYS = { level: "apexline.level", car: "apexline.car", aiCar: "apexline.aicar", line: "apexline.line", help: "apexline.help" };

function saved(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // kept for this race only
  }
}

export class Game {
  constructor(el, opts) {
    this.el = el;
    this.opts = opts;
    this.t = opts.labels || {};
    this.phase = "loading";
    this.paused = false;
    this.auto = false;
    this.camFar = false;
    this.follow = [{ yaw: 0, y: 0 }, { yaw: 0, y: 0 }];
    this.showLine = saved(KEYS.line, "1") === "1";
    this.help = saved(KEYS.help, "1") === "1";
    this.version = 0;
    this.model = opts.opponent || "";
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    el.classList.add("ax-root");
    el.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.cams = [new THREE.PerspectiveCamera(66, 1, 0.5, 6000), new THREE.PerspectiveCamera(66, 1, 0.5, 6000)];
    this.sound = new Sound();
    this.input = new Input((code) => this.key(code));
    this.note = h("div", { class: "ax-loading" }, this.t.loading || "Loading…");
    el.append(this.note);
    this.frame = this.frame.bind(this);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(el);
    window.__apexline = this;
    this.load().catch((e) => this.fail(e));
  }

  url(path) {
    return new URL(path, this.opts.backend || window.location.origin).toString();
  }

  async load() {
    const res = await fetch(this.url(`/_apexline/track/${encodeURIComponent(this.opts.track)}`), { cache: "no-store" });
    if (!res.ok) throw new Error(`${this.t.no_track || "No such track"} (${res.status})`);
    const pack = await res.json();
    if (this.disposed) return;
    this.pack = pack;
    this.track = new Track(pack);
    this.world = buildWorld(this.scene, this.track, pack.theme, this.renderer);
    this.player = new Car(this.track, "you");
    this.ai = new Car(this.track, "ai");
    this.driver = new Driver(this.ai);
    this.autopilot = new Driver(this.player);
    this.telemetry = new Telemetry(this.ai);
    const level = saved(KEYS.level, "normal");
    this.setLevel(LEVELS[level] ? level : "normal");
    this.env = reflections(this.renderer, this.world.theme);
    this.models = [null, null];
    const aiCar = saved(KEYS.aiCar, "gt");
    this.setAiCar(CARS[aiCar] ? aiCar : "gt");
    const car = saved(KEYS.car, "gt");
    this.setCar(CARS[car] ? car : "gt");
    this.guide = new Guide(this.scene, this.track);
    this.hud = new Hud(this.el, this.t, { you: this.t.you || "You", ai: this.aiName() });
    this.hud.pauseBtn.addEventListener("click", () => this.togglePause());
    this.planner = new Planner({ backend: this.opts.backend, track: pack.id, lang: this.opts.lang, car: () => this.aiCarFacts(), onState: (s) => this.planState(s) });
    this.plans = [];
    this.planInfo = { type: "waiting" };
    this.note.remove();
    this.grid();
    this.resize();
    this.phase = "briefing";
    this.showBriefing();
    this.askedFor = this.aiCarName;
    this.planner.ask({ plan: null, lap: 0 });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  aiName() {
    return this.model ? `AI · ${this.model}` : "AI";
  }

  fail(e) {
    console.error("Apexline:", e);
    this.note.textContent = `${this.t.failed || "Couldn't start the race"}: ${e && e.message ? e.message : e}`;
  }

  grid() {
    this.player.reset(0, PLAYER_OFF, 4);
    this.ai.reset(0, -PLAYER_OFF, 4);
    this.time = 0;
    this.lapStart = { you: 0, ai: 0 };
    this.lapTimes = { you: [], ai: [] };
    this.done = { you: null, ai: null };
    this.knocks = { you: 0, ai: 0 };
    this.bumps = 0;
    this.first = null;
    this.telemetry.start();
    this.telemetry.laps = [];
    this.snap = true;
    this.acc = 0;
  }

  // ------------------------------------------------------------ the AI's plan

  planPayload() {
    const p = this.driver.plan;
    return p && p.version ? { speeds: p.speeds, aggression: p.aggression, note: p.note || "", version: p.version } : null;
  }

  planState(s) {
    if (this.disposed) return;
    const still = s.type === "thinking" && this.planInfo.type === "thinking";
    if (s.type === "plan") {
      if (s.model) this.model = s.model;
      this.hud.ai.name.textContent = this.aiName();
      const plan = { speeds: s.plan.speeds || {}, aggression: s.plan.aggression ?? 1, note: s.plan.note || "", version: ++this.version, secs: s.secs, cached: !!s.cached, lap: s.lap, reply: s.reply || "" };
      this.driver.setPlan(plan);
      this.plans.push(plan);
      this.planInfo = { type: "ready", plan };
      if (this.phase === "racing") this.hud.flash("ai", fill(this.t.new_plan || "Plan v{v}", { v: plan.version }), performance.now());
    } else {
      this.planInfo = s;
    }
    if (this.phase === "briefing" && !still) this.showBriefing();
    this.drawPlan(true);
  }

  drawPlan(force) {
    const info = this.planInfo;
    const plan = this.driver.plan;
    let head;
    if (info.type === "thinking") head = fill(this.t.plan_thinking || "Thinking about plan v{v}… {s} s", { v: this.version + 1, s: Math.round(info.secs || 0) });
    else if (info.type === "error") head = fill(this.t.plan_failed || "The AI didn't answer: {e}", { e: info.text });
    else head = null;
    const key = `${head}|${plan.version}|${info.type}`;
    if (!force && key === this.planKey) return;
    this.planKey = key;
    const current = plan.version
      ? fill(plan.cached ? this.t.plan_remembered || "Remembered plan v{v}" : this.t.plan_ready || "Plan v{v} · {s} s of thinking", { v: plan.version, s: Math.round(plan.secs || 0) })
      : this.t.plan_cautious || "Driving carefully until the AI's plan comes";
    this.hud.setPlan(
      h(
        "div",
        {},
        h("div", { class: "ax-plan-head" }, current),
        head ? h("div", { class: `ax-plan-now ${info.type === "error" ? "ax-bad" : ""}` }, info.type === "thinking" ? h("span", { class: "ax-spin" }) : null, head) : null,
        plan.note ? h("div", { class: "ax-plan-note" }, `“${plan.note}”`) : null,
        h("div", { class: "ax-plan-aggr" }, this.t[`aggression_${plan.aggression ?? 1}`] || `aggression ${plan.aggression}`),
      ),
    );
  }

  // After each of the AI's laps: how it went, for the next plan.
  askAfterLap(record, laps) {
    let gap = this.ai.progress - this.player.progress;
    const report = {
      lap: laps,
      secs: Math.round(record.secs * 10) / 10,
      rival_secs: this.lapTimes.you[laps - 1] !== undefined ? Math.round(this.lapTimes.you[laps - 1] * 10) / 10 : null,
      ahead_m: Math.round(gap * this.track.ds),
      bumps: record.bumps,
      corners: record.corners.map((c) => ({ id: c.id, plan: c.plan, entry: c.entry, min: c.min, wide: c.wide, wall: c.wall })),
    };
    this.planner.ask({ report, plan: this.planPayload(), lap: laps });
  }

  // ------------------------------------------------------------ panels

  button(text, onClick, primary, id) {
    return h("button", { class: `ax-btn ${primary ? "ax-primary" : ""}`, onClick, "data-testid": id }, text);
  }

  setLevel(name) {
    this.levelName = name;
    this.driver.setLevel(LEVELS[name]);
    this.telemetry.pace = LEVELS[name].pace;
    save(KEYS.level, name);
  }

  setCar(name) {
    this.carName = name;
    const spec = carSpec(name, this.pack.car);
    this.player.setSpec(spec);
    this.autopilot.setPlan(gripPlan(this.track, LINE_SHARE, spec));
    this.models[0]?.dispose();
    this.models[0] = new CarModel(this.scene, { shape: name, who: "you", accent: "#fecaca", name: this.t.you || "You", env: this.env, night: this.world.night });
    save(KEYS.car, name);
  }

  setAiCar(name) {
    this.aiCarName = name;
    const spec = carSpec(name, this.pack.car);
    this.ai.setSpec(spec);
    this.driver.setPlan(cautiousPlan(this.track, spec));
    this.models[1]?.dispose();
    this.models[1] = new CarModel(this.scene, { shape: name, who: "ai", accent: "#bfdbfe", name: "AI", env: this.env, night: this.world.night });
    save(KEYS.aiCar, name);
  }

  // The AI's car, as its model is told it (apexline/strategist.py).
  aiCarFacts() {
    const spec = this.ai.spec;
    const tenth = (v) => Math.round(v * 10) / 10;
    return { id: this.aiCarName, name: this.t[`car_${this.aiCarName}`] || this.aiCarName, top: Math.round(spec.vmax * 3.6), lat: tenth(spec.lat), brake: tenth(spec.brake) };
  }

  // A plan is for one car: a new car sends the AI back to its studies, before the start at once and
  // after a race when the next one is asked for (again).
  chooseAiCar(name) {
    if (name === this.aiCarName) return;
    this.setAiCar(name);
    if (this.phase === "briefing") this.newPlan();
    else if (name === this.askedFor && this.plans.length) this.driver.setPlan(this.plans[this.plans.length - 1]);
  }

  newPlan() {
    this.planner.restart();
    this.plans = [];
    this.version = 0;
    this.askedFor = this.aiCarName;
    this.planInfo = { type: "thinking", secs: 0 };
    this.showBriefing();
    this.planner.ask({ plan: null, lap: 0 });
  }

  setAid(which, on) {
    if (which === "line") this.showLine = on;
    else this.help = on;
    save(KEYS[which], on ? "1" : "0");
  }

  // The two cars, as on the race's screen: yours on the left and the AI's on the right, each with
  // what it is good at and the four to pick from.
  garage(redraw) {
    const t = this.t;
    const stats = carStats(this.pack.car);
    const bay = (who, chosen, words, pick, prefix) =>
      h(
        "div",
        { class: `ax-bay ax-bay-${who}` },
        h("div", { class: "ax-bay-head" }, words),
        h("div", { class: "ax-bay-pic" }, this.picture(chosen, who)),
        h("div", { class: "ax-car-name" }, t[`car_${chosen}`] || chosen),
        h("div", { class: "ax-car-note" }, t[`car_${chosen}_note`] || ""),
        ...["power", "top", "grip", "brake", "nimble"].map((stat) =>
          h("span", { class: "ax-stat" }, t[`stat_${stat}`] || stat, h("span", { class: "ax-stat-bar" }, h("i", { style: `width:${Math.round(18 + 82 * stats[chosen][stat])}%` }))),
        ),
        h(
          "div",
          { class: "ax-thumbs" },
          ...Object.keys(CARS).map((name) =>
            h(
              "button",
              {
                class: `ax-thumb ${name === chosen ? "ax-on" : ""}`,
                title: t[`car_${name}`] || name,
                "data-testid": `${prefix}${name}`,
                onClick: () => {
                  pick(name);
                  redraw();
                },
              },
              this.picture(name, who),
            ),
          ),
        ),
      );
    return h(
      "div",
      { class: "ax-garage", "data-testid": "cars" },
      bay("you", this.carName, t.car || "Your car", (name) => this.setCar(name), "car-"),
      h("div", { class: "ax-vs-mark" }, "VS"),
      bay("ai", this.aiCarName, t.ai_car || "The AI's car", (name) => this.chooseAiCar(name), "ai-car-"),
    );
  }

  // Filled in when it is ready (cars.js draws them one at a time).
  picture(name, who) {
    return h("img", { alt: this.t[`car_${name}`] || name, src: carPicture(name, who) || null, "data-car": `${name}.${who}` });
  }

  // The opponent's level, to pick before a race; `redraw` shows the panel again with the new one.
  levelPicker(redraw) {
    const t = this.t;
    const choose = (name) => () => {
      this.setLevel(name);
      redraw();
    };
    return h(
      "div",
      { class: "ax-levels", "data-testid": "levels" },
      h("span", { class: "ax-level-label" }, t.level || "Difficulty"),
      ...Object.keys(LEVELS).map((name) => h("button", { class: `ax-btn ax-level ${name === this.levelName ? "ax-on" : ""}`, onClick: choose(name), "data-testid": `level-${name}` }, t[`level_${name}`] || name)),
    );
  }

  // What can be switched off.
  aidPicker(redraw) {
    const t = this.t;
    const aid = (which, on, text, tip) =>
      h(
        "button",
        {
          class: `ax-btn ax-level ${on ? "ax-on" : ""}`,
          title: tip,
          "data-testid": `aid-${which}`,
          onClick: () => {
            this.setAid(which, !on);
            redraw();
          },
        },
        `${on ? "✓ " : ""}${text}`,
      );
    return h(
      "div",
      { class: "ax-levels" },
      h("span", { class: "ax-level-label" }, t.aids || "Aids"),
      aid("help", this.help, t.aid_help || "Steering help", t.aid_help_tip),
      aid("line", this.showLine, t.aid_line || "Driving line L", t.aid_line_tip),
    );
  }

  showBriefing() {
    const t = this.t;
    const pack = this.pack;
    const info = this.planInfo;
    const plan = this.driver.plan;
    let status;
    this.studying = null;
    if (info.type === "thinking" || info.type === "waiting") {
      this.studying = h("span", {}, this.studyWords());
      status = h("div", { class: "ax-status" }, h("span", { class: "ax-spin" }), this.studying);
    }
    else if (info.type === "error") status = h("div", { class: "ax-status ax-bad" }, fill(t.study_failed || "The AI didn't answer ({e}): it will drive carefully.", { e: info.text }));
    else if (plan.cached) status = h("div", { class: "ax-status ax-ok" }, fill(t.remembered || "The AI remembers this track (plan v{v}).", { v: plan.version }));
    else status = h("div", { class: "ax-status ax-ok" }, fill(t.studied || "The AI has its plan ({s} s of thinking).", { s: Math.round(plan.secs || 0) }));
    const ready = info.type === "ready" || info.type === "error";
    const buttons = [
      ready
        ? this.button(t.start || "Start", () => this.go(), true, "start-race")
        : this.button(t.start_now || "Don't wait: start now", () => this.go(), false, "start-now"),
    ];
    if (plan.cached && info.type === "ready") buttons.push(this.button(t.restudy || "Let the AI study it again", () => this.restudy(), false, "restudy"));
    if (info.type === "error") buttons.push(this.button(t.ask_again || "Ask the AI again", () => this.restudy(), false, "ask-again"));
    buttons.push(this.button(t.other_track || "Another track", () => this.leave(), false, "leave"));
    this.hud.panel(
      h(
        "div",
        { class: "ax-card ax-wide", "data-testid": "briefing" },
        h("div", { class: "ax-title" }, pack.name[this.opts.lang] || pack.name.en),
        h("div", { class: "ax-sub" }, fill(t.track_facts || "{laps} laps · {length} m · {corners} corners", { laps: pack.laps, length: Math.round(pack.length), corners: pack.corners.length })),
        h("div", { class: "ax-vs" }, h("span", { class: "ax-red" }, t.you || "You"), " vs ", h("span", { class: "ax-blue" }, this.aiName())),
        status,
        plan.note ? h("div", { class: "ax-quote" }, `“${plan.note}”`) : null,
        this.garage(() => this.showBriefing()),
        this.levelPicker(() => this.showBriefing()),
        this.aidPicker(() => this.showBriefing()),
        h("div", { class: "ax-buttons" }, buttons),
        h("div", { class: "ax-keys" }, t.keys || "↑ throttle · ↓ brake · ← → steer · R back on the road · Esc pause · M sound · C camera"),
        h("div", { class: "ax-how" }, t.how_ai || ""),
      ),
    );
  }

  studyWords() {
    return fill(this.t.studying || "The AI is studying the track… {s} s", { s: Math.round(this.planInfo.secs || 0) });
  }

  restudy() {
    this.planner.restart();
    this.planInfo = { type: "thinking", secs: 0 };
    this.showBriefing();
    this.planner.ask({ plan: null, fresh: true, lap: 0 });
  }

  go() {
    this.sound.start();
    this.hud.panel(null);
    this.phase = "countdown";
    this.countFrom = performance.now();
  }

  togglePause() {
    if (this.phase !== "racing" && this.phase !== "countdown") return;
    this.paused = !this.paused;
    this.sound.pause(this.paused);
    if (!this.paused) {
      this.hud.panel(null);
      this.last = performance.now();
      return;
    }
    const t = this.t;
    this.hud.panel(
      h(
        "div",
        { class: "ax-card ax-small", "data-testid": "paused" },
        h("div", { class: "ax-title" }, t.paused || "Paused"),
        h("div", { class: "ax-buttons" }, this.button(t.resume || "Resume", () => this.togglePause(), true, "resume"), this.button(t.restart || "Restart", () => this.again(), false, "restart"), this.button(t.other_track || "Another track", () => this.leave(), false, "leave")),
      ),
    );
  }

  again() {
    this.paused = false;
    this.sound.pause(false);
    this.planner.restart();
    if (this.askedFor !== this.aiCarName) {
      this.hud.panel(null);
      this.grid();
      this.phase = "briefing";
      this.newPlan();
      return;
    }
    if (this.planInfo.type === "thinking") this.planInfo = { type: "ready", plan: this.driver.plan };
    const keep = this.driver.plan;
    this.plans = keep.version ? [keep] : [];
    this.grid();
    this.go();
  }

  leave() {
    this.planner.cancel();
    if (this.opts.onEvent) this.opts.onEvent({ type: "leave" });
  }

  key(code) {
    if (code === "KeyM") this.sound.toggle();
    else if (code === "KeyC") this.camFar = !this.camFar;
    else if (code === "KeyL") this.setAid("line", !this.showLine);
    else if (code === "Escape" || code === "KeyP") this.togglePause();
    else if (code === "KeyR" && this.phase === "racing" && !this.paused) this.player.putBack();
    else if (code === "Enter" && this.phase === "briefing" && (this.planInfo.type === "ready" || this.planInfo.type === "error")) this.go();
  }

  // ------------------------------------------------------------ the race

  frame(now) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      if (this.phase === "countdown") {
        const left = 3 - (now - this.countFrom) / 1000;
        if (left > 0) this.hud.countdown(String(Math.ceil(left)));
        else {
          this.phase = "racing";
          this.goAt = now;
          this.hud.countdown(this.t.go || "GO!");
        }
      }
      if (this.phase === "racing") {
        if (this.goAt && now - this.goAt > 800) {
          this.hud.countdown("");
          this.goAt = 0;
        }
        this.acc += dt;
        while (this.acc >= STEP) {
          this.physics(now);
          this.acc -= STEP;
          if (this.phase !== "racing") break;
        }
      }
      if (this.phase === "briefing" && this.planInfo.type === "thinking") this.showBriefingTick(now);
    }
    if (this.planInfo.type === "thinking") this.drawPlan(false);
    const between = this.phase === "racing" ? this.acc / STEP : 1;
    this.poses = [this.player.pose(between), this.ai.pose(between)];
    this.models[0].update(this.player, dt, this.poses[0]);
    this.models[1].update(this.ai, dt, this.poses[1]);
    this.aim(dt, now);
    this.lineOn = this.showLine && (this.phase === "racing" || this.phase === "countdown");
    if (this.lineOn) this.guide.update(this.player, this.autopilot.target);
    this.render(now / 1000);
    this.hud.update(this.hudState(), now);
    this.hud.drawMap(this.track, [[this.ai, "#3b82f6"], [this.player, "#ef4444"]]);
    const you = this.player;
    const running = this.phase === "racing" && !this.paused;
    this.sound.engine(Math.abs(you.u) * 3.6, you.input.throttle || 0, running);
    const load = Math.abs(you.side) / (you.spec.lat * you.grip());
    this.sound.tyres(running ? Math.max(0.3 * clamp((load - 0.88) / 0.12, 0, 1), clamp(Math.abs(you.slip) / 0.24, 0, 1)) : 0);
  }

  // Only the seconds change: a panel drawn anew under the mouse would lose a click.
  showBriefingTick(now) {
    if (now - (this.briefTick || 0) < 500) return;
    this.briefTick = now;
    if (this.studying) this.studying.textContent = this.studyWords();
  }

  physics(now) {
    const finished = this.done;
    const youIn = finished.you !== null || this.auto ? this.autopilot.control(this.ai) : this.player.assist(this.input.read(STEP, Math.abs(this.player.u)), this.help);
    if (finished.you !== null) youIn.throttle = Math.min(youIn.throttle, 0.4);
    const aiIn = this.driver.control(this.player);
    if (finished.ai !== null) aiIn.throttle = Math.min(aiIn.throttle, 0.4);
    this.player.step(youIn, STEP);
    this.ai.step(aiIn, STEP);
    collide(this.player, this.ai);
    this.telemetry.step(STEP, this.driver.plan);
    this.time += STEP;
    for (const [who, car] of [["you", this.player], ["ai", this.ai]]) {
      for (const e of car.events) {
        if (e.type === "wall") {
          this.knocks[who] += 1;
          if (who === "ai") this.telemetry.wall();
          else this.sound.knock(e.speed);
          if (e.speed > 3) this.hud.flash(who, this.t.wall || "Wall!", now);
        } else if (e.type === "bump" && who === "you") {
          this.bumps += 1;
          this.telemetry.bumps += 1;
          this.sound.knock(e.push * 2);
          this.hud.flash("you", this.t.bump || "Bump!", now);
          this.hud.flash("ai", this.t.bump || "Bump!", now);
        } else if (e.type === "reset") {
          this.hud.flash(who, this.t.reset || "Back on the road", now);
        } else if (e.type === "lap") {
          this.lap(who, e.laps, now);
        }
      }
      car.events.length = 0;
    }
    const both = this.done.you !== null && this.done.ai !== null;
    if (both || (this.first !== null && this.time - this.first > GRACE)) this.finish();
  }

  lap(who, laps, now) {
    const secs = this.time - this.lapStart[who];
    this.lapStart[who] = this.time;
    if (laps > this.lapTimes[who].length) this.lapTimes[who].push(secs);
    const total = this.pack.laps;
    if (laps >= total && this.done[who] === null) {
      this.done[who] = this.time;
      if (this.first === null) this.first = this.time;
      this.hud.flash(who, this.t.finished || "Finished!", now);
    }
    if (who === "ai") {
      const record = this.telemetry.lap(laps);
      if (laps < total) this.askAfterLap(record, laps);
    }
  }

  places() {
    const { you, ai } = this.done;
    if (you !== null || ai !== null) {
      const youFirst = you !== null && (ai === null || you <= ai);
      return youFirst ? [1, 2] : [2, 1];
    }
    return this.player.progress >= this.ai.progress ? [1, 2] : [2, 1];
  }

  hudState() {
    const [pYou, pAi] = this.places();
    const laps = this.pack.laps;
    const one = (who, car, place) => ({
      kmh: car.speedKmh,
      place,
      lap: Math.max(1, car.lapsDone + 1),
      lapTime: this.phase === "racing" && this.done[who] === null ? this.time - this.lapStart[who] : NaN,
      best: this.lapTimes[who].length ? Math.min(...this.lapTimes[who]) : NaN,
      done: this.done[who] !== null,
      wrongWay: car.wrongWay(),
    });
    return { laps, time: this.time, racing: this.phase === "racing", over: this.phase === "over", you: one("you", this.player, pYou), ai: one("ai", this.ai, pAi) };
  }

  finish() {
    if (this.phase === "over") return;
    this.phase = "over";
    this.planner.cancel();
    const t = this.t;
    const [pYou] = this.places();
    const winner = this.done.you === null && this.done.ai === null ? "none" : pYou === 1 ? "you" : "ai";
    const side = (who) => ({
      time: this.done[who],
      best: this.lapTimes[who].length ? Math.min(...this.lapTimes[who]) : null,
      laps: this.lapTimes[who].map((s) => Math.round(s * 100) / 100),
      knocks: this.knocks[who],
    });
    const plans = this.plans.map((p) => ({ version: p.version, speeds: p.speeds, aggression: p.aggression, note: p.note, secs: Math.round((p.secs || 0) * 10) / 10, cached: p.cached, lap: p.lap }));
    const result = { track: this.pack.id, model: this.model, level: this.levelName, car: this.carName, ai_car: this.aiCarName, laps: this.pack.laps, winner, you: side("you"), ai: side("ai"), bumps: this.bumps, plans, plan: this.planPayload() };
    if (this.opts.onEvent) this.opts.onEvent({ type: "finished", result });
    this.showResult(result);
  }

  showResult(result) {
    const t = this.t;
    const banner = result.winner === "you" ? t.you_win || "You win!" : result.winner === "ai" ? t.ai_wins || "The AI wins" : t.no_finish || "Nobody finished";
    const row = (name, side, cls) =>
      h("tr", {}, h("td", { class: cls }, name), h("td", {}, side.time === null ? t.dnf || "—" : clock(side.time)), h("td", {}, side.best === null ? "—" : clock(side.best)), h("td", {}, String(side.knocks)));
    const corners = this.pack.corners;
    const aiSpec = carSpec(result.ai_car, this.pack.car);
    const limit = (c) => Math.round(cornerLimit(this.track, c, aiSpec));
    const shown = this.plans.slice(-5);
    const cell = (kmh, limit) => {
      if (!kmh) return h("td", {}, "—");
      const share = kmh / limit;
      const cls = share > 1.08 ? "ax-over" : share >= 0.9 ? "ax-good" : share < 0.8 ? "ax-slow" : "";
      return h("td", { class: cls }, String(Math.round(kmh)));
    };
    const planTable = shown.length
      ? h(
          "table",
          { class: "ax-table ax-plans" },
          h("thead", {}, h("tr", {}, h("th", {}, t.corner || "Corner"), h("th", {}, t.limit || "Grip limit"), ...shown.map((p) => h("th", {}, `v${p.version}`)))),
          h("tbody", {}, ...corners.map((c) => h("tr", {}, h("td", {}, `${c.id} ${c.dir === "L" ? "↰" : "↱"} r${c.radius}`), h("td", {}, String(limit(c))), ...shown.map((p) => cell(Number(p.speeds[c.id]), limit(c)))))),
        )
      : h("div", { class: "ax-how" }, t.no_plan || "The AI never sent a plan: it drove carefully.");
    const notes = shown.filter((p) => p.note).map((p) => h("div", { class: "ax-quote" }, h("b", {}, `v${p.version} `), `(${Math.round(p.secs || 0)} s) “${p.note}”`));
    this.hud.panel(
      h(
        "div",
        { class: "ax-card ax-wide", "data-testid": "result" },
        h("div", { class: `ax-title ${result.winner === "you" ? "ax-red" : "ax-blue"}` }, banner),
        h("div", { class: "ax-sub" }, `${t[`car_${result.car}`] || result.car} vs ${this.aiName()} (${t[`car_${result.ai_car}`] || result.ai_car}) · ${t[`level_${result.level}`] || result.level}`),
        h(
          "table",
          { class: "ax-table" },
          h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, t.total || "Time"), h("th", {}, t.best_lap || "Best lap"), h("th", {}, t.knocks || "Wall knocks"))),
          h("tbody", {}, row(t.you || "You", result.you, "ax-red"), row("AI", result.ai, "ax-blue")),
        ),
        h("div", { class: "ax-section" }, t.plans_title || "The AI's plans (km/h) next to what the grip allows"),
        planTable,
        h("div", { class: "ax-legend" }, h("span", { class: "ax-over" }, t.legend_over || "too fast"), " · ", h("span", { class: "ax-good" }, t.legend_good || "near the limit"), " · ", h("span", { class: "ax-slow" }, t.legend_slow || "cautious")),
        ...notes,
        this.garage(() => this.showResult(result)),
        this.levelPicker(() => this.showResult(result)),
        h("div", { class: "ax-buttons" }, this.button(t.again || "Race again", () => this.again(), true, "again"), this.button(t.other_track || "Another track", () => this.leave(), false, "leave")),
      ),
    );
  }

  // ------------------------------------------------------------ cameras and drawing

  // Each camera hangs behind its car on a stiff arm that swings round a moment after the car:
  // the car is seen turning in the picture, and a tap doesn't jerk the whole world (Unreal's
  // spring arm calls this rotation lag). It looks between the nose and the way the car is going.
  aim(dt, now) {
    const pairs = [[this.cams[0], this.player, this.poses[0], this.follow[0]], [this.cams[1], this.ai, this.poses[1], this.follow[1]]];
    for (const [cam, car, pose, follow] of pairs) {
      if (this.phase === "briefing" || this.phase === "loading") {
        const a = now / 4000 + (car === this.ai ? Math.PI : 0);
        cam.position.set(car.x + Math.cos(a) * 13, car.y + 4.5, car.z + Math.sin(a) * 13);
        cam.lookAt(car.x, car.y + 1, car.z);
        continue;
      }
      const [vx, vz] = car.velocity();
      const course = car.u > 4 ? Math.atan2(vz, vx) : pose.yaw;
      const want = pose.yaw + angleDiff(course, pose.yaw) * 0.6;
      if (this.snap) {
        follow.yaw = want;
        follow.y = pose.y;
      } else {
        follow.yaw += angleDiff(want, follow.yaw) * (1 - Math.exp(-CAM_TURN * dt));
        follow.y += (pose.y - follow.y) * (1 - Math.exp(-9 * dt));
      }
      const back = this.camFar ? 11 : 7.4;
      const up = this.camFar ? 4.6 : 2.8;
      const hx = Math.cos(follow.yaw);
      const hz = Math.sin(follow.yaw);
      cam.position.set(pose.x - hx * back, follow.y + up, pose.z - hz * back);
      cam.lookAt(pose.x + hx * 6, follow.y + 1.1, pose.z + hz * 6);
      cam.fov = 64 + Math.min(12, Math.max(0, car.u) * 0.2);
    }
    if (this.phase !== "briefing") this.snap = false;
  }

  resize() {
    const w = this.el.clientWidth || 1;
    const hgt = this.el.clientHeight || 1;
    this.renderer.setSize(w, hgt, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.stacked = w < hgt * 0.9;
    if (this.hud) this.hud.layout(this.stacked);
  }

  render(time) {
    if (!this.world) return;
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const w = size.x;
    const hgt = size.y;
    const views = this.stacked ? [[0, hgt / 2, w, hgt / 2], [0, 0, w, hgt / 2]] : [[0, 0, w / 2, hgt], [w / 2, 0, w / 2, hgt]];
    r.setScissorTest(true);
    const sets = [[this.cams[0], this.player, this.models[0], this.models[1]], [this.cams[1], this.ai, this.models[1], this.models[0]]];
    sets.forEach(([cam, car, own, other], k) => {
      const [x, y, vw, vh] = views[k];
      own.showLabel(false);
      other.showLabel(true);
      this.guide.mesh.visible = this.lineOn && car === this.player;
      this.world.beforeView(cam, car, time);
      own.facing(cam);
      other.facing(cam);
      cam.aspect = vw / vh;
      cam.updateProjectionMatrix();
      r.setViewport(x, y, vw, vh);
      r.setScissor(x, y, vw, vh);
      r.render(this.scene, cam);
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.planner?.cancel();
    this.input.dispose();
    this.sound.dispose();
    this.hud?.dispose();
    this.world?.dispose();
    this.env?.dispose();
    this.guide?.dispose();
    for (const m of this.models || []) m.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.note.remove();
    if (window.__apexline === this) window.__apexline = null;
  }
}

export { cautiousPlan };
