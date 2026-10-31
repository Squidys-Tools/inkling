import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Glass } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { search, useSearch } from "../library/search.ts";
import { MascotEyes } from "../mascot/Mascot.tsx";
import { handleCommand } from "../shell/commands.ts";
import { setSearchFocused, useViewState } from "./viewState.ts";

const grow = stylex.keyframes({
  from: { opacity: 0.6, transform: "translateX(-50%) scale(0.97)" },
  to: { opacity: 1, transform: "translateX(-50%) scale(1)" },
});

/**
 * At rest a pill naming what the grid shows; focused, the full search field.
 * The field switches size at once and settles with a transform, so nothing
 * lays out per frame. A search always runs over the whole library.
 */
export function SearchBar({ viewName, inLibrary }: { viewName: string; inLibrary: boolean }) {
  const navigate = useNavigate();
  const query = useSearch((state) => state.query);
  const focused = useViewState((state) => state.searchFocused);
  const input = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      handleCommand("search", () => {
        // A page covering the library makes this field inert; search goes back to the library first.
        if (!input.current?.closest("[inert]")) return input.current?.focus();
        void navigate({ to: "/" }).then(() => requestAnimationFrame(() => input.current?.focus()));
      }),
    [navigate],
  );

  return (
    <Glass style={[styles.field, focused ? styles.expanded : styles.resting]}>
      <label {...stylex.props(styles.label, focused && styles.labelExpanded)}>
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
          placeholder="Search your mind"
          aria-label="Search your mind"
          spellCheck={false}
          autoComplete="off"
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
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
    </Glass>
  );
}

const styles = stylex.create({
  field: {
    position: "absolute",
    left: "50%",
    zIndex: 3,
    display: "flex",
    color: color.muted,
    transform: "translateX(-50%)",
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
    animationName: grow,
    animationDuration: motion.micro,
    animationTimingFunction: motion.enter,
  },
  label: {
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
