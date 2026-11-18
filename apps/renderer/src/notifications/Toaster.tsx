import { Toast } from "@base-ui/react/toast";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import type { Space } from "@inkling/contracts";
import { cardColor, color, font, motion } from "@inkling/ui/tokens.stylex";
import { useState, useSyncExternalStore } from "react";
import { KindIcon } from "../cards/KindIcon.tsx";
import { useSpaceThumbs } from "../library/spaceThumbs.ts";
import { toastMarker } from "../markers.stylex.ts";
import { SpaceCover } from "../shell/SpaceCover.tsx";
import { type NoticeData, type NoticeSubject, notifications } from "./toasts.ts";

export function Toaster() {
  return (
    <Toast.Provider toastManager={notifications.manager} limit={3}>
      <ToastList />
    </Toast.Provider>
  );
}

// Window focus events, not document.hasFocus(): focus inside an embed's iframe blurs the
// window, which pauses Base UI's timer, while hasFocus() stays true.
let windowFocused: boolean | null = null;
const watchFocus = (change: () => void) => {
  const focus = () => ((windowFocused = true), change());
  const blur = () => ((windowFocused = false), change());
  window.addEventListener("focus", focus);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("focus", focus);
    window.removeEventListener("blur", blur);
  };
};

function ToastList() {
  const { toasts } = Toast.useToastManager<NoticeData>();
  // Base UI holds a toast's timer while its window is in the background; the countdown holds with it.
  const away = !useSyncExternalStore(watchFocus, () => windowFocused ?? document.hasFocus());
  return (
    <Toast.Portal>
      <Toast.Viewport aria-label="Notifications" {...stylex.props(styles.viewport)}>
        {toasts.map((toast) => {
          const error = toast.type === "error";
          const subject = toast.data?.subject;
          return (
            <Toast.Root
              key={toast.id}
              toast={toast}
              swipeDirection="right"
              onKeyDown={(event) => {
                if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                event.stopPropagation();
                notifications.dismiss(toast.id);
              }}
              {...stylex.props(toastMarker, styles.toast, error && styles.error)}
            >
              {subject && !error && <Tile key={toast.data?.shown} subject={subject} />}
              <Toast.Content {...stylex.props(styles.content)}>
                <Toast.Title {...stylex.props(styles.title)} />
                {toast.description && <Toast.Description {...stylex.props(styles.description)} />}
              </Toast.Content>
              {toast.actionProps && (
                <button type="button" {...toast.actionProps} {...stylex.props(styles.action)} />
              )}
              <Toast.Close aria-label="Dismiss notification" {...stylex.props(styles.close)}>
                <HugeiconsIcon icon={Cancel01Icon} size={12} />
              </Toast.Close>
              {toast.timeout !== undefined && toast.timeout > 0 && (
                <span
                  key={toast.data?.shown}
                  aria-hidden="true"
                  {...stylex.props(styles.countdown, away && styles.held)}
                  style={{ animationDuration: `${toast.timeout}ms` }}
                />
              )}
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

function Tile({ subject }: { subject: NoticeSubject }) {
  const [broken, setBroken] = useState(false);
  if (subject._tag === "Space") return <SpaceTile space={subject.space} />;
  if (subject.image && !broken)
    return (
      <img
        src={subject.image}
        alt=""
        draggable={false}
        decoding="async"
        onError={() => setBroken(true)}
        {...stylex.props(styles.tile, styles.picture)}
      />
    );
  return (
    <span aria-hidden="true" {...stylex.props(styles.tile, styles.kind)}>
      <KindIcon kind={subject.kind} size={14} />
    </span>
  );
}

function SpaceTile({ space }: { space: Space }) {
  const thumbs = useSpaceThumbs(space);
  return <SpaceCover space={space} thumbs={thumbs} style={styles.tile} />;
}

const drain = stylex.keyframes({
  from: { transform: "scaleX(1)" },
  to: { transform: "scaleX(0)" },
});

const styles = stylex.create({
  viewport: {
    position: "fixed",
    top: "48px",
    right: "16px",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    width: "min(340px, calc(100vw - 32px))",
    outline: "none",
    pointerEvents: "none",
  },
  toast: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "9px",
    minHeight: "46px",
    padding: "6px 6px 6px 7px",
    overflow: "hidden",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    borderRadius: "11px",
    backgroundColor: color.raised,
    color: color.ink,
    boxShadow: `0 14px 32px ${color.shadow}`,
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
  // A red outline stands in for the picture: an error is about the attempt, not an item.
  error: { paddingLeft: "10px", borderColor: cardColor.dangerOutline },
  tile: {
    flexShrink: 0,
    width: "32px",
    height: "32px",
    borderRadius: "7px",
  },
  picture: { objectFit: "cover", backgroundColor: color.surface },
  kind: {
    display: "grid",
    placeItems: "center",
    backgroundColor: color.hover,
    color: color.inkSoft,
  },
  content: { flex: 1, minWidth: 0 },
  title: {
    margin: 0,
    overflow: "hidden",
    fontFamily: font.display,
    fontSize: "12.5px",
    fontWeight: 500,
    lineHeight: "16px",
    color: color.inkStrong,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  description: {
    display: "-webkit-box",
    margin: 0,
    overflow: "hidden",
    fontSize: "11.5px",
    lineHeight: "15px",
    color: color.muted,
    overflowWrap: "anywhere",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  action: {
    flexShrink: 0,
    height: "24px",
    paddingInline: "9px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    borderRadius: "7px",
    backgroundColor: { default: "transparent", ":hover": color.hover },
    color: color.inkStrong,
    fontFamily: font.display,
    fontSize: "11.5px",
    fontWeight: 500,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
  close: {
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    width: "20px",
    height: "20px",
    padding: 0,
    appearance: "none",
    borderWidth: 0,
    borderRadius: "6px",
    backgroundColor: { default: "transparent", ":hover": color.hover },
    color: { default: color.faint, ":hover": color.ink },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  // Drains over the toast's timeout and holds whenever Base UI holds the timer:
  // while the pointer or focus is on the toasts (data-expanded) or the window is away.
  countdown: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "2px",
    backgroundColor: color.accent,
    opacity: 0.7,
    transformOrigin: "left",
    pointerEvents: "none",
    animationName: drain,
    animationTimingFunction: "linear",
    animationFillMode: "forwards",
    animationPlayState: {
      default: "running",
      [stylex.when.ancestor("[data-expanded]", toastMarker)]: "paused",
    },
    display: { default: "block", "@media (prefers-reduced-motion: reduce)": "none" },
  },
  held: { animationPlayState: "paused" },
});
