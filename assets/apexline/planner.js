// Asking the AI for its plan, through the game's backend (POST /_apexline/plan, which asks the AI
// Hub: apexline/api.py). The answer streams as lines of JSON: {"t": seconds} while the model
// thinks, then {"plan": ..., "model", "secs", "said", "reply"} or {"error"}. The conversation
// (what the game said, what the model answered) is kept here and sent each time, so the model
// sees its earlier plans and how they went. Leaving the race cancels the question, which stops
// the model too. `car()` says which car the AI drives, as the model is told it.

export class Planner {
  constructor({ backend, track, lang, car, onState }) {
    this.url = new URL("/_apexline/plan", backend || window.location.origin).toString();
    this.track = track;
    this.lang = lang;
    this.car = car;
    this.onState = onState;
    this.history = [];
    this.busy = false;
    this.abort = null;
  }

  // report: the lap that just ended (null before the start); plan: the plan driving now.
  async ask({ report = null, plan = null, fresh = false, lap = 0 } = {}) {
    if (this.busy) return null;
    this.busy = true;
    const ctrl = (this.abort = new AbortController());
    const started = performance.now();
    this.onState({ type: "thinking", secs: 0, lap });
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track: this.track, lang: this.lang, car: this.car(), history: this.history, report, plan, fresh, lap }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, cut).trim();
          buf = buf.slice(cut + 1);
          if (!line) continue;
          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.error) throw new Error(msg.error);
          if (msg.plan) {
            if (msg.said && msg.reply) this.history.push({ role: "user", content: msg.said }, { role: "assistant", content: msg.reply });
            const answer = { ...msg, secs: msg.secs ?? (performance.now() - started) / 1000, lap };
            this.onState({ type: "plan", ...answer });
            return answer;
          }
          if (msg.t !== undefined) this.onState({ type: "thinking", secs: msg.t, lap });
        }
      }
      throw new Error("the answer ended early");
    } catch (e) {
      if (ctrl.signal.aborted) return null;
      this.onState({ type: "error", text: String(e && e.message ? e.message : e), lap });
      return null;
    } finally {
      if (this.abort === ctrl) {
        this.abort = null;
        this.busy = false;
      }
    }
  }

  // A new race: the conversation starts over (the plan in use is sent with the next question).
  restart() {
    this.cancel();
    this.history = [];
  }

  cancel() {
    if (this.abort) this.abort.abort();
    this.abort = null;
    this.busy = false;
  }
}
