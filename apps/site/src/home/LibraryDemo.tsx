import * as stylex from "@stylexjs/stylex";
import { color, font, radius } from "@inkling/ui/tokens.stylex";
import { useDeferredValue, useState } from "react";
import { CardFace } from "../../../renderer/src/cards/CardFace.tsx";
import { MascotEyes } from "../../../renderer/src/mascot/Mascot.tsx";
import { searchDemo } from "./demoLibrary.ts";

const suggestions = ["fuji", "a quote about time", "anime", "night", "paper"];
const ignore = () => {};

export function LibraryDemo() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const deferred = useDeferredValue(query);
  const found = searchDemo(deferred);

  return (
    <section aria-label="Try the search on a demo library" {...stylex.props(styles.demo)}>
      <label {...stylex.props(styles.field, focused && styles.fieldFocused)}>
        <span {...stylex.props(styles.eyes)}>
          <MascotEyes size={30} bobbing={query !== ""} />
        </span>
        <input
          type="search"
          value={query}
          placeholder="Describe something you saved"
          aria-label="Search the demo library"
          spellCheck={false}
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery("");
          }}
          {...stylex.props(styles.input)}
        />
      </label>
      <div {...stylex.props(styles.suggestions)}>
        <span {...stylex.props(styles.try)}>Try</span>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setQuery(suggestion)}
            {...stylex.props(styles.suggestion, query === suggestion && styles.suggestionOn)}
          >
            {suggestion}
          </button>
        ))}
      </div>
      {/* The cards are pictures of the app here: nothing in them opens. */}
      <div inert {...stylex.props(styles.grid)}>
        {found.map((view, index) => (
          <div key={view.id} {...stylex.props(styles.cell)}>
            <CardFace
              view={view}
              index={index}
              list={false}
              selected={false}
              processing={undefined}
              onOpen={ignore}
              onRead={ignore}
              onMenu={ignore}
            />
          </div>
        ))}
      </div>
      {found.length === 0 && (
        <p {...stylex.props(styles.empty)}>
          Nothing in this demo has every one of those words. The app also searches by meaning and
          reads the words inside your pictures.
        </p>
      )}
    </section>
  );
}

const styles = stylex.create({
  demo: { display: "flex", flexDirection: "column", gap: "14px" },
  field: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    height: "64px",
    paddingInline: "20px",
    borderRadius: radius.overlay,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    cursor: "text",
  },
  fieldFocused: { borderColor: color.accent },
  eyes: { display: "flex", width: "30px", flexShrink: 0 },
  input: {
    flexGrow: 1,
    minWidth: 0,
    height: "100%",
    padding: 0,
    borderWidth: 0,
    outline: "none",
    backgroundColor: "transparent",
    color: color.inkStrong,
    fontFamily: font.display,
    fontSize: "22px",
    letterSpacing: "-0.01em",
    "::placeholder": { color: color.faint },
  },
  suggestions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    marginBottom: "18px",
  },
  try: { color: color.muted, fontSize: "14px", marginRight: "4px" },
  suggestion: {
    height: "30px",
    paddingInline: "12px",
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: { default: "transparent", ":hover": color.hover },
    color: color.inkSoft,
    fontFamily: font.body,
    fontSize: "14px",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
  suggestionOn: { borderColor: color.accent, color: color.inkStrong },
  grid: { columnWidth: "232px", columnGap: "12px" },
  cell: { breakInside: "avoid" },
  empty: { margin: 0, maxWidth: "52ch", color: color.muted, lineHeight: 1.6 },
});
