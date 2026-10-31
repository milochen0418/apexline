// Music for the race, from the shared audio library: a song picked in Music Box or made in Music
// Studio. It is read whole and played through the game's own sound, so pausing and M work on it too.
// A piece that says where it loops (`loop_start`, `loop_end`) goes round without a seam; any other
// song starts again from the top.

const VOLUME_KEY = "apexline.musicvolume";
const FADE = 1.6; // seconds at the end of a race

function savedVolume() {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? v : 0.7;
  } catch {
    return 0.7;
  }
}

// Which song a track has: its own, else the one picked last anywhere; "off" means none here.
export function savedSong(track) {
  try {
    const own = localStorage.getItem(`apexline.music.${track}`);
    if (own === "off") return null;
    return JSON.parse(own || localStorage.getItem("apexline.music") || "null");
  } catch {
    return null;
  }
}

export function saveSong(track, song) {
  try {
    localStorage.setItem(`apexline.music.${track}`, song ? JSON.stringify(song) : "off");
    if (song) localStorage.setItem("apexline.music", JSON.stringify(song));
  } catch {
    // kept for this race only
  }
}

function boxUrl(ref) {
  const host = window.location.hostname.replace(/^[^.]+/, "music-box");
  return `${window.location.protocol}//${host}/_box/sound?ref=${encodeURIComponent(ref)}`;
}

export class Music {
  constructor(sound, url) {
    this.sound = sound;
    this.url = url; // a song's ref to where it is served
    this.song = null;
    this.buffer = null;
    this.source = null;
    this.gain = null;
    this.state = "none"; // none, loading, ready, failed
    this.volume = savedVolume();
  }

  // Reads the song now, so the race can start it at once.
  async load(song) {
    this.stop();
    this.song = song;
    this.buffer = null;
    this.state = song ? "loading" : "none";
    if (!song) return;
    const wanted = song.ref;
    try {
      let res = await fetch(this.url(song.ref));
      // An install from before this game could read the library: Music Box serves the same file.
      if (!res.ok) res = await fetch(boxUrl(song.ref));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await res.arrayBuffer();
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const buffer = await new Offline(2, 44100, 44100).decodeAudioData(bytes);
      if (!this.song || this.song.ref !== wanted) return;
      this.buffer = buffer;
      this.state = "ready";
    } catch (e) {
      console.warn("Apexline: no music:", e);
      if (this.song && this.song.ref === wanted) this.state = "failed";
    }
  }

  play() {
    const ctx = this.sound.ctx;
    if (!ctx || !this.buffer) return;
    this.stop();
    const src = (this.source = ctx.createBufferSource());
    src.buffer = this.buffer;
    src.loop = true;
    const { loop_start: from, loop_end: to } = this.song;
    if (to > from && to <= this.buffer.duration) {
      src.loopStart = from;
      src.loopEnd = to;
    }
    this.gain = ctx.createGain();
    this.gain.gain.value = this.volume;
    src.connect(this.gain);
    this.gain.connect(this.sound.master);
    src.start();
  }

  setVolume(v) {
    this.volume = v;
    if (this.gain) this.gain.gain.setTargetAtTime(v, this.sound.ctx.currentTime, 0.05);
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      // kept for this race only
    }
  }

  fadeOut() {
    if (!this.source) return;
    const ctx = this.sound.ctx;
    this.gain.gain.setTargetAtTime(0, ctx.currentTime, FADE / 4);
    this.source.stop(ctx.currentTime + FADE);
    this.source = null;
    this.gain = null;
  }

  stop() {
    if (!this.source) return;
    try {
      this.source.stop();
    } catch {
      // already stopped
    }
    this.source.disconnect();
    this.gain.disconnect();
    this.source = null;
    this.gain = null;
  }
}
