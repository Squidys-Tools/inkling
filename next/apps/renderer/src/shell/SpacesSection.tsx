import { Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { useId } from "react";
import { cardColor, color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { shownScope, useScope } from "../library/cards.ts";
import { search } from "../library/search.ts";
import { createSpace, dismissSpaceError, useSpaceError, useSpaces } from "../library/spaces.ts";
import { useStore } from "../library/store.ts";
import { SpaceRow } from "./SpaceRow.tsx";
import {
  closeSpaceDraft,
  openSpaceDraft,
  spaceDraft,
  updateSpaceDraft,
  useSpaceDraft,
} from "./spaceDraft.ts";

export function SpacesSection() {
  const spaces = useSpaces();
  const shown = useStore(shownScope, (scope) => scope);
  const shownState = useScope(shown);
  const draft = useSpaceDraft();
  const error = useSpaceError();

  return (
    <div {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.header)}>
        <span>Spaces</span>
        <button
          type="button"
          aria-label="Add a Space"
          title="Add a Space"
          aria-expanded={draft.open}
          onClick={() => (draft.open ? closeSpaceDraft() : openSpaceDraft(""))}
          {...stylex.props(styles.add)}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={14} />
        </button>
      </div>
      <div {...stylex.props(styles.list)}>
        {spaces.map((space) => {
          const selected = shown._tag === "Space" && shown.spaceId === space.id;
          // A Smart Space has no stored membership, so its count is known only while it is open.
          const count = space.itemCount ?? (selected ? shownState?.total : undefined);
          return <SpaceRow key={space.id} space={space} selected={selected} count={count} />;
        })}
      </div>
      {draft.open && <SpaceDraftForm />}
      {error && (
        <div {...stylex.props(styles.error)}>
          <p role="alert" {...stylex.props(styles.errorText)}>
            {error}
          </p>
          <button
            type="button"
            aria-label="Dismiss Space error"
            onClick={dismissSpaceError}
            {...stylex.props(styles.dismiss)}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function SpaceDraftForm() {
  const navigate = useNavigate();
  const draft = useSpaceDraft();
  const hint = useId();
  const query = draft.query.trim();

  return (
    <form
      {...stylex.props(styles.form)}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!draft.name.trim()) return;
        const created = await createSpace(draft.name, draft.kind, draft.query);
        if (!created) return;
        // The draft may have changed while the Space was being made; only close the one that asked.
        if (spaceDraft.get() === draft) closeSpaceDraft();
        search.clear();
        void navigate({ to: "/space/$id", params: { id: created.id } });
      }}
    >
      <input
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- The form opens because the user asked for a new Space; its name is the next thing typed.
        autoFocus
        value={draft.name}
        onChange={(event) => updateSpaceDraft({ name: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Escape") closeSpaceDraft();
        }}
        placeholder={draft.kind === "smart" && query ? `Save “${query}” as…` : "Name this space"}
        aria-label="Space name"
        maxLength={80}
        {...stylex.props(styles.input)}
      />
      {/* Native radios: arrow keys, one tab stop and group semantics come from the platform. */}
      <fieldset {...stylex.props(styles.kinds)}>
        <legend {...stylex.props(styles.srOnly)}>How this Space fills</legend>
        {(["smart", "regular"] as const).map((kind) => (
          <label
            key={kind}
            {...stylex.props(styles.kind, draft.kind === kind && styles.kindSelected)}
          >
            <input
              type="radio"
              name="space-kind"
              value={kind}
              checked={draft.kind === kind}
              aria-describedby={hint}
              onChange={() => updateSpaceDraft({ kind })}
              {...stylex.props(styles.srOnly, stylex.defaultMarker())}
            />
            {kind === "smart" ? "Smart" : "Regular"}
          </label>
        ))}
      </fieldset>
      <p id={hint} {...stylex.props(styles.hint)}>
        {draft.kind === "regular"
          ? "Holds only the items you file into it. Right-click a card and pick a Space to add it."
          : query
            ? "A Smart Space that updates automatically as items match this search."
            : "An empty Smart Space matches everything you have saved."}
      </p>
      <div {...stylex.props(styles.actions)}>
        <Button onClick={closeSpaceDraft}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={!draft.name.trim()}>
          Create Space
        </Button>
      </div>
    </form>
  );
}

const enter = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(-6px)" },
  to: { opacity: 1, transform: "none" },
});

const styles = stylex.create({
  section: { display: "flex", flexDirection: "column", gap: "2px", minHeight: 0 },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "28px",
    paddingInline: "10px",
    fontFamily: font.body,
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: 500,
    letterSpacing: "0.02em",
    color: color.muted,
  },
  add: {
    display: "grid",
    placeItems: "center",
    width: "22px",
    height: "22px",
    marginRight: "-3px",
    padding: 0,
    borderWidth: 0,
    borderRadius: "6px",
    backgroundColor: { default: "transparent", ":hover": color.overlayActive },
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  list: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "2px",
    minHeight: 0,
    overflowY: "auto",
    scrollbarWidth: "none",
  },
  form: {
    display: "grid",
    gap: "8px",
    paddingTop: "6px",
    paddingInline: "10px",
    paddingBottom: "10px",
    animationName: enter,
    animationDuration: motion.mascot,
    animationTimingFunction: motion.enter,
  },
  input: {
    boxSizing: "border-box",
    width: "100%",
    minHeight: "33px",
    paddingInline: "10px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.border, ":focus": color.accent },
    borderRadius: "8px",
    backgroundColor: color.surface,
    color: color.ink,
    fontFamily: font.body,
    fontSize: "13px",
    outline: "none",
    "::placeholder": { color: color.faint },
  },
  kinds: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "3px",
    minWidth: 0,
    margin: 0,
    padding: "3px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    borderRadius: radius.control,
    backgroundColor: color.surface,
  },
  kind: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingBlock: "6px",
    borderRadius: "6px",
    fontSize: "12px",
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    // The real input is clipped, so the label draws its focus ring.
    outline: {
      default: "none",
      [stylex.when.descendant(":focus-visible")]: `2px solid ${color.accent}`,
    },
    outlineOffset: "3px",
  },
  kindSelected: {
    backgroundColor: color.accentSoft,
    fontWeight: 600,
    color: { default: color.accent, ":hover": color.accent },
  },
  hint: { margin: 0, fontSize: "11px", lineHeight: 1.45, color: color.muted },
  actions: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" },
  error: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    marginTop: "8px",
    paddingBlock: "8px",
    paddingLeft: "9px",
    paddingRight: "7px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: cardColor.dangerEdge,
    borderRadius: "8px",
    backgroundColor: cardColor.dangerWash,
    fontFamily: font.body,
    fontSize: "12px",
    lineHeight: 1.4,
    color: color.danger,
  },
  errorText: { flexGrow: 1, margin: 0 },
  dismiss: {
    display: "grid",
    placeItems: "center",
    minWidth: "24px",
    minHeight: "24px",
    padding: "2px",
    borderWidth: 0,
    borderRadius: "5px",
    backgroundColor: { default: "transparent", ":hover": color.dangerSoft },
    color: { default: color.danger, ":hover": color.ink },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  srOnly: {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    padding: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});
