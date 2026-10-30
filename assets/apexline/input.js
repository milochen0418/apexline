// The driver's hands: arrow keys or WASD (Space brakes too), R puts the car back on the road,
// Esc or P pauses, M mutes, C changes the camera, L shows the driving line; a gamepad works too
// (left stick, triggers).

const KEYS = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  Space: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

export class Input {
  constructor(onKey) {
    this.held = new Set();
    this.onKey = onKey;
    this.steer = 0;
    this.down = (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      const k = KEYS[e.code];
      if (k) {
        this.held.add(k);
        e.preventDefault();
      } else if (!e.repeat && ["KeyR", "Escape", "KeyP", "KeyM", "KeyC", "KeyL", "Enter"].includes(e.code)) {
        this.onKey(e.code);
        if (e.code !== "Escape") e.preventDefault();
      }
    };
    this.up = (e) => {
      const k = KEYS[e.code];
      if (k) this.held.delete(k);
    };
    this.blur = () => this.held.clear();
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.blur);
  }

  // Throttle, brake and steering for this moment. A key is only on or off, so the steering eases
  // (SuperTuxKart's time-full-steer and time-reset-steer): back to the middle quickly, away from
  // it more gently the faster the car goes (`speed`, m/s), so a tap is a small correction.
  read(dt, speed = 0) {
    let throttle = this.held.has("up") ? 1 : 0;
    let brake = this.held.has("down") ? 1 : 0;
    let want = (this.held.has("left") ? 1 : 0) - (this.held.has("right") ? 1 : 0);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const x = pad.axes[0] || 0;
      if (Math.abs(x) > 0.12) want = -x;
      throttle = Math.max(throttle, pad.buttons[7]?.value || 0, pad.buttons[0]?.pressed ? 1 : 0);
      brake = Math.max(brake, pad.buttons[6]?.value || 0, pad.buttons[1]?.pressed ? 1 : 0);
      break;
    }
    const back = want * this.steer < 0 || Math.abs(want) < Math.abs(this.steer);
    const rate = back ? 7 : 1 / (0.1 + 0.12 * Math.min(1, speed / 42));
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, want - this.steer));
    return { throttle, brake, steer: this.steer };
  }

  dispose() {
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.blur);
  }
}
