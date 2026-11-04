import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Glass } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef } from "react";
import { color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { chrome } from "../desktop.ts";
import { search, useSearch } from "../library/search.ts";
import { MascotEyes } from "../mascot/Mascot.tsx";
import { handleCommand } from "../shell/commands.ts";
import { setSearchFocused, useViewState } from "./viewState.ts";
import { searchSurfaceFrames } from "./searchSurface.ts";

const reveal = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(3px)" },
  to: { opacity: 1, transform: "none" },
});

/**
 * At rest a pill naming what the grid shows; focused, the full search field.
 * Only the glass backing morphs between the two measured bounds; text and
 * pointer targets stay unscaled. Search always runs over the whole library.
 */
export function SearchBar({ viewName, inLibrary }: { viewName: string; inLibrary: boolean }) {
  const navigate = useNavigate();
  const query = useSearch((state) => state.query);
  const focused = useViewState((state) => state.searchFocused);
  const input = useRef<HTMLInputElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const origin = useRef<DOMRect | null>(null);
  const flight = useRef<Animation | null>(null);
  const focusChanged = (next: boolean) => {
    if (focused === next) return;
    // Read the current animated bounds before changing layout, including a mid-flight reversal.
    origin.current = surface.current?.getBoundingClientRect() ?? null;
    setSearchFocused(next);
  };

  useLayoutEffect(() => {
    const element = surface.current;
    const from = origin.current;
    origin.current = null;
    flight.current?.cancel();
    if (!element || !from || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const computed = getComputedStyle(element);
    const frames = searchSurfaceFrames(
      from,
      element.getBoundingClientRect(),
      computed.borderRadius,
    );
    if (!frames) return;
    const duration = parseFloat(computed.transitionDuration) * 1000;
    const animation = element.animate(frames, {
      duration: duration * (focused ? 1 : 0.7),
      easing: computed.transitionTimingFunction,
    });
    flight.current = animation;
    return () => animation.cancel();
  }, [focused]);

  useEffect(() => {
    const stop = () => flight.current?.cancel();
    window.addEventListener("resize", stop);
    return () => window.removeEventListener("resize", stop);
  }, []);

  useEffect(
    () =>
      handleCommand("search", () => {
        // A page covering the library makes this field inert; search goes back to the library first.
        if (!input.current?.closest("[inert]")) return input.current?.focus();
        void navigate({ to: "/" }).then(() => requestAnimationFrame(() => input.current?.focus()));
      }),
    [navigate],
  );

  const captionPill = chrome.controls === "custom-right";
  return (
    <div
      {...stylex.props(
        styles.field,
        focused ? styles.expanded : styles.resting,
        captionPill && styles.captionCorridor,
        captionPill && focused && styles.captionExpanded,
        captionPill && !focused && styles.captionResting,
      )}
    >
      <Glass ref={surface} aria-hidden="true" data-bench="search-surface" style={styles.surface} />
      <label
        {...stylex.props(
          styles.label,
          focused && styles.labelExpanded,
          captionPill && styles.captionLabel,
        )}
      >
        {!focused && (
          <span {...stylex.props(styles.rest)} aria-hidden="true">
            <span {...stylex.props(styles.restIcon)}>
              <HugeiconsIcon icon={Search01Icon} size={14} />
            </span>
            {viewName}
          </span>
        )}
        {focused && (
          <span {...stylex.props(styles.eyes)}>
            <MascotEyes size={22} bobbing={query !== ""} />
          </span>
        )}
        <input
          ref={input}
          type="search"
          value={query}
          placeholder={captionPill ? "Search" : "Search your mind"}
          aria-label="Search your mind"
          spellCheck={false}
          autoComplete="off"
          onFocus={() => focusChanged(true)}
          onBlur={() => focusChanged(false)}
          onChange={(event) => {
            const value = event.target.value;
            search.setQuery(value);
            if (value.trim() && !inLibrary) void navigate({ to: "/" });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void search.submit();
            if (event.key !== "Escape") return;
            event.preventDefault();
            search.clear();
            event.currentTarget.blur();
          }}
          {...stylex.props(styles.input, !focused && styles.hidden)}
        />
        {focused && <kbd {...stylex.props(styles.hint)}>esc to close</kbd>}
      </label>
    </div>
  );
}

const styles = stylex.create({
  // The inset caption pill keeps its slot while hidden, so a small window must
  // leave it room rather than letting the centered search field pass beneath it.
  captionCorridor: {
    left: { default: "50%", "@media (max-width: 1023px)": "calc((100% - 129px) / 2)" },
    maxWidth: { default: "none", "@media (max-width: 1023px)": "calc(100% - 129px)" },
  },
  captionExpanded: {
    width: {
      default: "min(700px, calc(100% - 304px))",
      "@media (max-width: 1023px)": "calc(100% - 129px)",
    },
    minWidth: {
      default: "min(420px, calc(100% - 28px))",
      "@media (max-width: 1023px)": "0px",
    },
  },
  // Follows the caption pill's 13px inset, so the resting field stays level with it.
  captionResting: { top: "14px" },
  captionLabel: {
    boxSizing: { default: "content-box", "@media (max-width: 1023px)": "border-box" },
    minWidth: { default: "auto", "@media (max-width: 1023px)": "0px" },
  },
  field: {
    position: "absolute",
    left: "50%",
    zIndex: 3,
    display: "flex",
    color: color.muted,
    transform: "translateX(-50%)",
    pointerEvents: "auto",
    WebkitAppRegion: "no-drag",
  },
  surface: {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    pointerEvents: "none",
    transformOrigin: "top left",
    transitionProperty: "none",
    transitionDuration: motion.layout,
    transitionTimingFunction: motion.enter,
  },
  resting: {
    top: "9px",
    height: "34px",
    borderRadius: "17px",
  },
  expanded: {
    top: "1px",
    height: "50px",
    width: "min(700px, calc(100% - 304px))",
    minWidth: "min(420px, calc(100% - 28px))",
    borderRadius: radius.overlay,
  },
  label: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    paddingLeft: "13px",
    paddingRight: "16px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  labelExpanded: {
    gap: "12px",
    paddingInline: "16px",
    cursor: "text",
    animationName: reveal,
    animationDuration: motion.reveal,
    animationTimingFunction: motion.enter,
  },
  rest: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    fontFamily: font.body,
    fontSize: "13px",
    lineHeight: "16px",
    fontWeight: 600,
    color: color.ink,
  },
  restIcon: { display: "grid", opacity: 0.55 },
  eyes: { display: "flex", alignItems: "center", width: "24px", flexShrink: 0 },
  input: {
    flexGrow: 1,
    minWidth: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: color.ink,
    fontFamily: font.body,
    fontSize: "14px",
    outline: "none",
    "::placeholder": { color: color.muted },
    "::-webkit-search-cancel-button": { display: "none" },
  },
  // Kept focusable at rest, so Tab and the shortcut still reach it.
  hidden: {
    position: "absolute",
    width: "1px",
    opacity: 0,
    pointerEvents: "none",
  },
  hint: {
    fontFamily: font.mono,
    fontSize: "10px",
    lineHeight: "12px",
    whiteSpace: "nowrap",
    color: color.muted,
    display: { default: "inline", "@media (max-width: 780px)": "none" },
  },
});
