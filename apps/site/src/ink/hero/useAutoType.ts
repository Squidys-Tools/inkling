import { useEffect, useState } from "react";

const queries = [
  "that poster with the mountain at night",
  "the one about wasting time",
  "lanterns outside that bar in tokyo",
];

/** Types the sample queries one key at a time; the first query stands still until active. */
export function useAutoType(active: boolean, onKey: (progress: number) => void) {
  const [text, setText] = useState(queries[0]!);
  useEffect(() => {
    if (!active) return;
    let query = 0;
    let length = 0;
    let deleting = false;
    let timer = 0;
    const tick = () => {
      const target = queries[query]!;
      if (!deleting && length < target.length) {
        length += 1;
        setText(target.slice(0, length));
        if (target[length - 1] !== " ") onKey(length / target.length);
        timer = window.setTimeout(tick, 60 + Math.random() * 95);
      } else if (!deleting) {
        deleting = true;
        timer = window.setTimeout(tick, 2400);
      } else if (length > 0) {
        length = Math.max(0, length - 2);
        setText(target.slice(0, length));
        timer = window.setTimeout(tick, 28);
      } else {
        deleting = false;
        query = (query + 1) % queries.length;
        timer = window.setTimeout(tick, 700);
      }
    };
    timer = window.setTimeout(() => {
      setText("");
      tick();
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [active, onKey]);
  return text;
}
