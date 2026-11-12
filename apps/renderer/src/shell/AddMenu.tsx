import PlusSignIcon from "@hugeicons/core-free-icons/PlusSignIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef } from "react";
import { cardColor, color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { captureFiles, captureScreenshot, useCaptureState } from "../capture/capture.ts";
import type { Choice } from "./AddChoices.tsx";
import { handleCommand } from "./commands.ts";

// Base UI's menu is a large share of the first screen's code and only matters once the button
// is pressed, so the button paints alone and the menu attaches when it has loaded.
const AddChoices = lazy(() =>
  import("./AddChoices.tsx").then((module) => ({ default: module.AddChoices })),
);

/**
 * The sidebar's Add button. Note, Link and Quote open their pages; File and
 * Screenshot save straight into the library without leaving it.
 */
export function AddMenu({
  compact,
  beside = 0,
}: {
  compact: boolean;
  /** The width of what shares the button's row, which the sidebar's motion leaves for it. */
  beside?: number;
}) {
  const navigate = useNavigate();
  const files = useRef<HTMLInputElement>(null);
  const saving = useCaptureState((state) => state.saving > 0);

  useEffect(() => handleCommand("addFile", () => files.current?.click()), []);

  const choose = (id: Choice["id"]) => {
    if (id === "file") files.current?.click();
    else if (id === "screen") void captureScreenshot();
    else void navigate({ to: `/add/${id}` });
  };
  const trigger = {
    "aria-label": compact ? (saving ? "Saving…" : "Add") : undefined,
    title: compact ? "Add" : undefined,
    ...stylex.props(styles.trigger, compact && styles.compact),
  };
  const label = (
    <>
      <HugeiconsIcon icon={PlusSignIcon} size={16} />
      {!compact && (
        <span data-sidebar-label data-sidebar-add-label {...stylex.props(styles.label)}>
          {saving ? "Saving…" : "Add"}
        </span>
      )}
    </>
  );

  return (
    <div
      data-sidebar-add
      data-sidebar-add-beside={beside || undefined}
      {...stylex.props(styles.anchor, beside > 0 && styles.inRow(beside))}
    >
      <input
        ref={files}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          captureFiles([...(event.currentTarget.files ?? [])]);
          event.currentTarget.value = "";
        }}
        {...stylex.props(styles.fileInput)}
      />
      <Suspense
        fallback={
          <button type="button" {...trigger}>
            {label}
          </button>
        }
      >
        <AddChoices trigger={trigger} onChoose={choose}>
          {label}
        </AddChoices>
      </Suspense>
    </div>
  );
}

const styles = stylex.create({
  anchor: { position: "relative", marginBottom: "8px" },
  // A width, not flex growth, so the sidebar's motion can still size the button.
  inRow: (beside: number) => ({
    width: `calc(100% - ${beside}px)`,
    flexShrink: 0,
    marginBottom: 0,
  }),
  label: { display: "inline-block", overflow: "hidden", whiteSpace: "nowrap" },
  fileInput: {
    position: "absolute",
    width: "1px",
    height: "1px",
    opacity: 0,
    pointerEvents: "none",
  },
  trigger: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    width: "100%",
    height: "40px",
    paddingInline: "14px",
    borderWidth: 0,
    borderRadius: radius.tile,
    backgroundColor: { default: color.ink, ":hover": cardColor.addHover },
    boxShadow: `inset 0 1px 0 ${cardColor.addHighlight}, inset 0 -2px 0 ${cardColor.addLowlight}, 0 6px 18px ${cardColor.addShadow}`,
    color: color.window,
    fontFamily: font.body,
    fontSize: "14px",
    lineHeight: "18px",
    fontWeight: 600,
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.96)" },
    transitionProperty: "background-color, transform",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "3px",
  },
  compact: { paddingInline: 0 },
});
