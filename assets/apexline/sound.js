// The engine of your car (its pitch follows the speed), its tyres at the grip's limit (they sing
// before they let go, the cue a wheel's force feedback gives) and the thud of a knock, made with
// Web Audio: nothing to download. It starts with the first click (browsers need one); M mutes.

const MUTE_KEY = "apexline_muted";

export class Sound {
  constructor() {
    this.ctx = null;
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      this.muted = false;
    }
  }

  start() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.osc = ctx.createOscillator();
    this.osc.type = "sawtooth";
    this.osc2 = ctx.createOscillator();
    this.osc2.type = "square";
    this.osc.connect(filter);
    this.osc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.osc.start();
    this.osc2.start();
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let k = 0; k < data.length; k++) data[k] = Math.random() * 2 - 1;
    this.tyre = ctx.createBufferSource();
    this.tyre.buffer = noise;
    this.tyre.loop = true;
    this.tyreBand = ctx.createBiquadFilter();
    this.tyreBand.type = "bandpass";
    this.tyreBand.frequency.value = 1500;
    this.tyreBand.Q.value = 7;
    this.tyreGain = ctx.createGain();
    this.tyreGain.gain.value = 0;
    this.tyre.connect(this.tyreBand);
    this.tyreBand.connect(this.tyreGain);
    this.tyreGain.connect(this.master);
    this.tyre.start();
  }

  // `amount`: 0 quiet, 1 a full slide.
  tyres(amount) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.tyreGain.gain.setTargetAtTime(amount * 0.28, now, 0.05);
    this.tyreBand.frequency.setTargetAtTime(1300 + amount * 800, now, 0.08);
  }

  engine(kmh, throttle, running) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const gear = kmh % 55;
    const f = 48 + gear * 2.4 + kmh * 0.35;
    this.osc.frequency.setTargetAtTime(f, now, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 0.5, now, 0.05);
    this.engineGain.gain.setTargetAtTime(running ? 0.05 + throttle * 0.05 : 0, now, 0.1);
  }

  knock(strength) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.18);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let k = 0; k < len; k++) data[k] = (Math.random() * 2 - 1) * (1 - k / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = Math.min(0.8, 0.15 + strength * 0.05);
    src.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch {
      // a private window: the choice lasts this page only
    }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  pause(on) {
    if (!this.ctx) return;
    if (on) this.ctx.suspend();
    else this.ctx.resume();
  }

  dispose() {
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }
}
