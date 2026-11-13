import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { useSyncExternalStore } from "react";
import { cardColor, color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { answerConfirm, confirmRequests } from "./confirm.ts";

/** The app's own confirmation, drawn for every `confirm()` call. Cancel comes first, so it holds focus. */
export function ConfirmDialog() {
  const request = useSyncExternalStore(confirmRequests.subscribe, confirmRequests.get);
  return (
    <AlertDialog.Root
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) answerConfirm(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop {...stylex.props(styles.backdrop)} />
        <AlertDialog.Popup {...stylex.props(styles.popup)}>
          <AlertDialog.Title {...stylex.props(styles.title)}>{request?.message}</AlertDialog.Title>
          {request?.detail && (
            <AlertDialog.Description {...stylex.props(styles.detail)}>
              {request.detail}
            </AlertDialog.Description>
          )}
          <div {...stylex.props(styles.actions)}>
            <Button variant="outline" onClick={() => answerConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant={request?.destructive ? "danger" : "primary"}
              onClick={() => answerConfirm(true)}
            >
              {request?.confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

const appear = stylex.keyframes({
  from: { opacity: 0, transform: "translate(-50%, -48%) scale(0.98)" },
  to: { opacity: 1, transform: "translate(-50%, -50%)" },
});

const styles = stylex.create({
  // Above Settings (70), which asks before installing an update.
  backdrop: { position: "fixed", inset: 0, zIndex: 90, backgroundColor: color.scrim },
  popup: {
    position: "fixed",
    top: "50%",
    left: "50%",
    zIndex: 91,
    boxSizing: "border-box",
    width: "min(400px, calc(100vw - 32px))",
    padding: "20px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: cardColor.controlEdge,
    borderRadius: radius.panel,
    backgroundColor: color.surface,
    boxShadow: `0 24px 70px ${color.shadow}`,
    transform: "translate(-50%, -50%)",
    animationName: appear,
    animationDuration: motion.micro,
    animationTimingFunction: motion.enter,
    outline: "none",
  },
  title: {
    margin: 0,
    fontFamily: font.body,
    fontSize: "17px",
    lineHeight: 1.25,
    fontWeight: 500,
    letterSpacing: "-0.02em",
    color: color.ink,
    overflowWrap: "anywhere",
  },
  detail: {
    marginTop: "6px",
    marginBottom: 0,
    fontFamily: font.body,
    fontSize: "13px",
    lineHeight: 1.45,
    color: color.muted,
  },
  actions: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" },
});
