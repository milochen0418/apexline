// The race for Reflex (apexline/components.py): mounts the game (game.js) and hands it the page's
// props; a new track, backend or language makes a new game.
import React, { useEffect, useRef } from "react";
import { Game } from "./game.js";

export function ApexRace({ track, backend, labels, lang, opponent, song, onEvent }) {
  const box = useRef(null);
  const running = useRef(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const words = useRef(labels);
  words.current = labels;
  const who = useRef(opponent);
  who.current = opponent;

  useEffect(() => {
    if (!box.current || !track) return undefined;
    let game;
    try {
      game = new Game(box.current, {
        track,
        backend,
        lang,
        labels: words.current || {},
        opponent: who.current || "",
        onEvent: (e) => handler.current && handler.current(e),
      });
    } catch (e) {
      console.error("Apexline:", e);
      return undefined;
    }
    running.current = game;
    return () => {
      running.current = null;
      game.dispose();
    };
  }, [track, backend, lang]);

  // A song chosen in another app's dialog.
  useEffect(() => {
    if (!song || !song.ref || !running.current) return;
    running.current.setSong(song);
    handler.current && handler.current({ type: "music.taken" });
  }, [song]);

  return <div ref={box} className="ax-box" data-track={track} />;
}
