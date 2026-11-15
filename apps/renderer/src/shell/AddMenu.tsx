import PlusSignIcon from "@hugeicons/core-free-icons/PlusSignIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef } from "react";
import { color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { captureFiles, captureScreenshot, useCaptureState } from "../capture/capture.ts";
import type { Choice } from "./AddChoices.tsx";
import { railSquare } from "./NavRow.tsx";
import { handleCommand } from "./commands.ts";

// Base UI's menu is a large share of the first screen's code and only matters once the button
// is pressed, so the button paints alone and the menu attaches when it has loaded.
const AddChoices = lazy(() =>
  import("./AddChoices.tsx").then((module) => ({ default: module.AddChoices })),
);

/**
 * The sidebar's Add button, in the top bar or under the rail's mascot. Note, Link and
 * Quote open their pages; File and Screenshot save straight into the library.
 */
export function AddMenu({ compact }: { compact: boolean }) {
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
    ...stylex.props(styles.trigger, compact && styles.compact, compact && railSquare),
  };
  const label = (
    <>
      <HugeiconsIcon icon={PlusSignIcon} size={compact ? 16 : 14} />
      {!compact && <span data-sidebar-label>{saving ? "Saving…" : "Add"}</span>}
    </>
  );

  return (
    <div data-glide="add" {...stylex.props(styles.anchor, compact && styles.anchorCompact)}>
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
  anchor: { position: "relative", flexShrink: 0, WebkitAppRegion: "no-drag" },
  fileInput: {
    position: "absolute",
    width: "1px",
    height: "1px",
    opacity: 0,
    pointerEvents: "none",
  },
  // Quiet like the close button beside it; the word is what makes it read as Add.
  trigger: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    height: "30px",
    paddingLeft: "8px",
    paddingRight: "10px",
    borderWidth: 0,
    borderRadius: radius.control,
    backgroundColor: {
      default: "transparent",
      ":hover": color.overlayHover,
      ":focus-visible": color.overlayHover,
      ":active": color.overlayActive,
    },
    color: { default: color.inkSoft, ":hover": color.ink, ":focus-visible": color.ink },
    fontFamily: font.body,
    fontSize: "13px",
    lineHeight: "18px",
    fontWeight: 500,
    whiteSpace: "nowrap",
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.96)" },
    transitionProperty: "color, background-color, transform",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.enter,
    outline: "none",
  },
  compact: { justifyContent: "center", width: "100%", height: "36px", paddingInline: 0 },
  anchorCompact: { width: "100%" },
});
