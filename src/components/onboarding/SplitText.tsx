import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { gsap } from "gsap";
import { SplitText as GsapSplitText } from "gsap/SplitText";
import { prefersReducedMotion } from "../mascot/mascotStore";

gsap.registerPlugin(GsapSplitText);

/**
 * React Bits' Split Text, trimmed to what onboarding uses: a headline whose
 * letters rise into place once, on mount. GSAP's SplitText keeps an aria-label
 * with the whole string, so screen readers still hear one heading.
 */
export function SplitText({
  text,
  className,
  style,
  delay = 0,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
  /** Seconds before the first letter moves. */
  delay?: number;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let split: GsapSplitText | null = null;
    let tween: gsap.core.Tween | null = null;
    let cancelled = false;

    // Splitting measures glyphs, so it waits for the face. Hidden meanwhile,
    // or the finished headline would flash before its letters drop out.
    const run = () => {
      if (cancelled) return;
      split = GsapSplitText.create(el, { type: "words,chars" });
      el.style.visibility = "";
      tween = gsap.from(split.chars, {
        opacity: 0,
        y: 40,
        duration: 1.25,
        ease: "power3.out",
        stagger: 0.05,
        delay,
        onComplete: () => split?.revert(),
      });
    };
    if (document.fonts.status === "loaded") run();
    else {
      el.style.visibility = "hidden";
      void document.fonts.ready.then(run);
    }

    return () => {
      cancelled = true;
      tween?.kill();
      split?.revert();
      el.style.visibility = "";
    };
  }, [delay]);

  return (
    <h1 ref={ref} className={className} style={style}>
      {text}
    </h1>
  );
}
