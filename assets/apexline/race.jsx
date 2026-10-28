// The race for Reflex (apexline/components.py): mounts the game (game.js) and hands it the page's
// props; a new track, backend or language makes a new game.
import React, { useEffect, useRef } from "react";
import { Game } from "./game.js";

export function ApexRace({ track, backend, labels, lang, opponent, onEvent }) {
  const box = useRef(null);
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
    return () => game.dispose();
  }, [track, backend, lang]);

  return <div ref={box} className="ax-box" data-track={track} />;
}
