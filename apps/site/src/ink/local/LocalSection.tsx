import * as stylex from "@stylexjs/stylex";
import { inkLocal } from "@inkling/ui/tokens.stylex";
import { Link } from "@tanstack/react-router";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "../../landing/environment.ts";
import { landing, media } from "../../landing/landing.stylex.ts";
import { createGlassCube, type GlassCube } from "./glassCube.ts";

const spec = [
  ["Account", "none"],
  ["Cloud", "none"],
  ["Library", "one SQLite file and your files, in a folder"],
  ["Search + OCR", "on your machine"],
  ["License", "MIT"],
] as const;

const faces = [
  ["/media/red-hat-400.ttf", "400"],
  ["/media/red-hat-500.ttf", "500"],
  ["/media/red-hat-700.ttf", "700"],
] as const;

function registerRedHat() {
  if ([...document.fonts].some((face) => face.family === "Red Hat")) return;
  for (const [url, weight] of faces) {
    const face = new FontFace("Red Hat", `url(${url}) format("truetype")`, {
      weight,
      display: "swap",
    });
    document.fonts.add(face);
    void face.load().catch(() => {});
  }
}

export function LocalSection() {
  // The prerendered page is the still: motion starts only once the browser says it may.
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  const [state, setState] = useState<"waiting" | "ready" | "unsupported">("waiting");
  const cube = useRef<GlassCube | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(registerRedHat, []);

  const mount = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    const created = createGlassCube(canvas, calm);
    if (!created) {
      setState("unsupported");
      return;
    }
    cube.current = created;
    setState("ready");
    const seen = new IntersectionObserver(([entry]) => created.setVisible(!!entry?.isIntersecting));
    seen.observe(canvas);
    return () => {
      seen.disconnect();
      created.dispose();
      cube.current = null;
    };
  };

  const press = (event: PointerEvent<HTMLCanvasElement>) => {
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const last = pointer.current;
    if (!last || last.id !== event.pointerId) return;
    cube.current?.drag(event.clientX - last.x, event.clientY - last.y);
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const release = () => {
    pointer.current = null;
    cube.current?.release();
  };

  return (
    <section {...stylex.props(styles.section)} aria-labelledby="ink-local-title">
      <h2 id="ink-local-title" {...stylex.props(styles.title)}>
        Nothing leaves the glass.
      </h2>
      <div {...stylex.props(styles.stage)}>
        {state === "unsupported" ? (
          <img
            src="/media/ink/local/glass-cube.webp"
            alt=""
            width={1600}
            height={1000}
            {...stylex.props(styles.fill)}
          />
        ) : (
          <canvas
            key={String(calm)}
            ref={mount}
            aria-hidden
            onPointerDown={press}
            onPointerMove={move}
            onPointerUp={release}
            onPointerCancel={release}
            {...stylex.props(styles.fill, styles.canvas, state === "ready" && styles.shown)}
          />
        )}
      </div>
      <dl {...stylex.props(styles.sheet)}>
        {spec.map(([label, value]) => (
          <div key={label} {...stylex.props(styles.row)}>
            <dt {...stylex.props(styles.label)}>{label}</dt>
            <dd {...stylex.props(styles.value)}>{value}</dd>
          </div>
        ))}
      </dl>
      <Link to="/privacy" {...stylex.props(styles.link)}>
        Every time inkling uses the network
      </Link>
    </section>
  );
}

const styles = stylex.create({
  section: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    paddingInline: landing.gutter,
    paddingBlock: { default: "clamp(72px, 10vw, 160px)", [media.phone]: "72px" },
    backgroundColor: inkLocal.studio,
    color: inkLocal.ink,
    fontFamily: landing.font,
  },
  title: {
    position: "relative",
    zIndex: 1,
    maxWidth: "11ch",
    margin: 0,
    fontSize: landing.display,
    fontWeight: 500,
    lineHeight: 0.9,
    letterSpacing: "-0.045em",
    textWrap: "balance",
  },
  stage: {
    position: "relative",
    width: "100%",
    maxWidth: "1400px",
    alignSelf: "center",
    aspectRatio: { default: "16 / 10", [media.phone]: "1 / 1" },
    maxHeight: "78svh",
    marginTop: { default: "clamp(-120px, -6vw, -24px)", [media.phone]: "8px" },
  },
  fill: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  canvas: {
    opacity: 0,
    cursor: { default: "grab", ":active": "grabbing" },
    touchAction: "pan-y",
    transition: { default: `opacity 1.4s ${landing.ease}`, [media.reduced]: "none" },
  },
  shown: { opacity: 1 },
  sheet: {
    display: "grid",
    gridTemplateColumns: { default: "repeat(5, minmax(0, 1fr))", [media.tablet]: "1fr" },
    width: "100%",
    maxWidth: "1100px",
    alignSelf: "center",
    margin: 0,
    borderTopWidth: { default: 1, [media.tablet]: 0 },
    borderTopStyle: "solid",
    borderTopColor: inkLocal.hairline,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: inkLocal.hairline,
  },
  row: {
    display: "flex",
    flexDirection: { default: "column", [media.tablet]: "row" },
    justifyContent: { default: "flex-start", [media.tablet]: "space-between" },
    gap: { default: "10px", [media.tablet]: "24px" },
    paddingBlock: { default: "16px 18px", [media.tablet]: "12px" },
    paddingInline: { default: "16px", [media.tablet]: 0 },
    borderLeftWidth: { default: 1, ":first-child": 0, [media.tablet]: 0 },
    borderLeftStyle: "solid",
    borderLeftColor: inkLocal.hairline,
    borderTopWidth: { default: 0, [media.tablet]: 1 },
    borderTopStyle: "solid",
    borderTopColor: inkLocal.hairline,
  },
  label: {
    color: inkLocal.muted,
    fontSize: "10.5px",
    fontWeight: 500,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  value: {
    margin: 0,
    fontSize: "13px",
    lineHeight: 1.45,
    textAlign: { default: "start", [media.tablet]: "end" },
  },
  link: {
    alignSelf: { default: "flex-end", [media.tablet]: "flex-start" },
    marginTop: "20px",
    marginRight: { default: "max(0px, calc((100% - 1100px) / 2))", [media.tablet]: 0 },
    color: inkLocal.muted,
    fontSize: "12px",
    letterSpacing: "0.02em",
    textDecorationLine: "underline",
    textDecorationColor: inkLocal.linkRule,
    textUnderlineOffset: "4px",
    transition: "color 0.3s",
    ":hover": { color: inkLocal.ink },
    ":focus-visible": { color: inkLocal.ink, outline: `1px solid ${inkLocal.ink}` },
  },
});
