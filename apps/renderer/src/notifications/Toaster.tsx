import { Toast } from "@base-ui/react/toast";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { notifications } from "./toasts.ts";

export function Toaster() {
  return (
    <Toast.Provider toastManager={notifications.manager} limit={3}>
      <ToastList />
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport aria-label="Notifications" {...stylex.props(styles.viewport)}>
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            swipeDirection="right"
            {...stylex.props(styles.toast)}
          >
            <Toast.Content {...stylex.props(styles.content)}>
              <Toast.Title {...stylex.props(styles.title)} />
              {toast.description && <Toast.Description {...stylex.props(styles.description)} />}
            </Toast.Content>
            {toast.actionProps && (
              <button type="button" {...toast.actionProps} {...stylex.props(styles.action)} />
            )}
            <Toast.Close aria-label="Dismiss notification" {...stylex.props(styles.close)}>
              <HugeiconsIcon icon={Cancel01Icon} size={14} />
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

const styles = stylex.create({
  viewport: {
    position: "fixed",
    top: "48px",
    right: "16px",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: "min(380px, calc(100vw - 32px))",
    outline: "none",
    pointerEvents: "none",
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 14px",
    borderRadius: radius.panel,
    backgroundColor: color.raised,
    color: color.ink,
    boxShadow: `0 18px 40px ${color.shadow}`,
    fontFamily: font.body,
    pointerEvents: "auto",
    WebkitAppRegion: "no-drag",
    opacity: { default: 1, ":is([data-starting-style], [data-ending-style], [data-limited])": 0 },
    transform: {
      default: "translateX(var(--toast-swipe-movement-x, 0px))",
      ":is([data-starting-style], [data-ending-style])": "translateX(calc(100% + 24px))",
    },
    transitionProperty: "opacity, transform",
    transitionDuration: motion.reveal,
    transitionTimingFunction: motion.enter,
  },
  content: { flex: 1, minWidth: 0 },
  title: { margin: 0, fontSize: "13px", fontWeight: 600, lineHeight: "18px" },
  description: {
    marginTop: "3px",
    fontSize: "12px",
    lineHeight: "17px",
    color: color.inkSoft,
    overflowWrap: "anywhere",
  },
  action: {
    flexShrink: 0,
    minHeight: "32px",
    paddingInline: "11px",
    border: 0,
    borderRadius: radius.control,
    backgroundColor: { default: color.accent, ":hover": color.accentStrong },
    color: color.onAccent,
    fontFamily: font.body,
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.ink}` },
    outlineOffset: "2px",
  },
  close: {
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    width: "28px",
    height: "32px",
    padding: 0,
    border: 0,
    borderRadius: radius.control,
    backgroundColor: { default: "transparent", ":hover": color.hover },
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
});
