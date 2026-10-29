import { Cancel01Icon, SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { MascotHomeSlot } from "../../components/mascot/MascotHomeSlot";
import { Button, type ButtonProps } from "../../ui/Button";
import { cx } from "../../ui/cx";

const rowTones = {
  nav: "text-[14px] text-ink-soft hover:text-ink",
  footer: "text-[13px] text-muted hover:text-ink",
  update:
    "text-[13px] text-green hover:enabled:text-[#a5c3b1] disabled:cursor-progress disabled:opacity-70",
};

export const rowClass =
  "flex h-8 min-w-0 items-center rounded-row px-2.5 text-left leading-[18px] cursor-pointer transition-[color,background-color,translate] duration-180 ease-[ease] hover:bg-white/6 active:translate-y-px";

export function NavRow({
  active = false,
  tone = "nav",
  className,
  ...props
}: ButtonProps & { active?: boolean; tone?: keyof typeof rowTones }) {
  return (
    <Button
      className={cx(
        rowClass,
        "gap-2.5",
        active
          ? cx(tone === "nav" ? "text-[14px]" : "text-[13px]", "font-semibold text-ink-active")
          : rowTones[tone],
        className,
      )}
      {...props}
    />
  );
}

export const navLabelClass = "min-w-0 flex-1";
export const countClass =
  "w-10 flex-[0_0_40px] text-right font-mono text-[12px] leading-4 font-normal text-muted";

// Paper's Everything glyph. Hugeicons has no 3x3 dot grid, so it is drawn here.
function NavDotGridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      {[5, 12, 19].flatMap((cy) =>
        [5, 12, 19].map((cx) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.2" fill="currentColor" />
        )),
      )}
    </svg>
  );
}

// Narrow windows slide the sidebar in over a scrim. Wide ones keep it still
// underneath while the library frame (App's <main>) slides over it.
export function Sidebar({
  experimental = false,
  onOpen,
  isOpen,
  edgeToggle,
  isSearchFocused,
  everything,
  onClose,
  children,
  footer,
}: {
  experimental?: boolean;
  onOpen: () => void;
  isOpen: boolean;
  edgeToggle: boolean;
  isSearchFocused: boolean;
  everything: { active: boolean; count: number; onSelect: () => void };
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.button
            key="sidebar-scrim"
            type="button"
            className="fixed inset-0 z-25 block size-full border-0 bg-[rgba(10,10,9,0.48)] cursor-pointer wide:hidden"
            aria-label="Close navigation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>
      <aside
        id="library-navigation"
        inert={!experimental && !isOpen}
        data-collapsed={experimental && !isOpen}
        className={
          experimental
            ? "codex-sidebar group fixed z-30 flex min-h-0 flex-col gap-6 bg-canvas wide:absolute wide:z-auto"
            : cx(
                "group fixed inset-y-0 left-0 z-30 flex h-screen min-h-0 shrink-0 flex-col gap-[22px] overflow-hidden border-r bg-canvas pt-6 pb-2.5 shadow-[16px_0_40px_rgba(0,0,0,0.45)] transition-transform duration-240 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
                "wide:absolute wide:z-auto wide:w-sidebar wide:translate-x-0 wide:border-transparent wide:bg-transparent wide:px-2.5 wide:pt-[26px] wide:pb-1.5 wide:opacity-100 wide:shadow-none wide:transition-[visibility] wide:duration-0",
                isOpen
                  ? "w-[min(248px,calc(100vw-42px))] translate-x-0 border-border px-2.5"
                  : // Hidden once covered on wide windows, so its controls leave the tab order.
                    "w-0 min-w-0 -translate-x-[102%] border-transparent px-0 opacity-0 wide:invisible wide:delay-300",
              )
        }
      >
        <div
          className={cx("-mb-2 flex h-11 items-center pr-1 pl-1.5", experimental && "codex-brand")}
        >
          {experimental && !isOpen ? (
            <button
              type="button"
              className="sidebar-toggle codex-mascot-open"
              aria-label="Open sidebar"
              aria-expanded={false}
              aria-controls="library-navigation"
              data-tooltip="Open sidebar"
              onClick={onOpen}
            >
              <MascotHomeSlot isSearchFocused={false} />
            </button>
          ) : (
            <MascotHomeSlot isSearchFocused={experimental ? false : isSearchFocused} />
          )}
          <span className="codex-label ml-2 font-quote text-[20px] leading-none font-normal tracking-[-0.04em] whitespace-nowrap text-ink select-none">
            inkling
          </span>
          <Button
            className={cx(
              "sidebar-close absolute top-4 right-3 z-1 inline-flex size-10 flex-none items-center justify-center rounded-lg border border-transparent text-muted cursor-pointer transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[#4a4842] hover:bg-surface hover:text-ink",
              "wide:static wide:ml-auto wide:size-[30px] wide:rounded-[7px] wide:hover:rounded-lg wide:hover:border-transparent",
              isOpen
                ? "wide:group-[:not(:hover,:focus-within)]:opacity-0"
                : "pointer-events-none -translate-x-5 opacity-0",
              edgeToggle && !experimental && "wide:hidden",
            )}
            hidden={experimental && !isOpen}
            aria-label="Close sidebar"
            aria-expanded={isOpen}
            aria-controls="library-navigation"
            data-tooltip="Close sidebar"
            onClick={onClose}
          >
            <HugeiconsIcon icon={SidebarLeftIcon} size={16} />
          </Button>
        </div>

        <nav className="grid gap-0.5" aria-label="Main navigation">
          <NavRow
            active={everything.active}
            onClick={everything.onSelect}
            aria-label="Everything"
            data-tooltip={experimental && !isOpen ? "Everything" : undefined}
          >
            <span
              className={cx(
                "grid w-4 flex-none place-items-center",
                everything.active ? "text-accent" : "text-muted",
              )}
            >
              <NavDotGridIcon />
            </span>
            <span className={navLabelClass}>Everything</span>
            <span className={countClass}>{everything.count.toLocaleString()}</span>
          </NavRow>
        </nav>

        {children}

        <div className="mt-auto grid gap-0.5">{footer}</div>
      </aside>
    </>
  );
}

export function SidebarError({
  message,
  collapsed,
  onDismiss,
}: {
  message: string;
  collapsed: boolean;
  onDismiss: () => void;
}) {
  return (
    <div
      className={cx(
        "m-0 flex items-start gap-2 rounded-lg border border-[rgba(208,112,85,0.28)] bg-[rgba(208,112,85,0.06)] pr-[7px] pl-[9px] font-body text-[12px] leading-[1.4] text-[#d07055]",
        collapsed ? "min-w-24 flex-[0_1_min(220px,30vw)] self-center py-[5px]" : "py-2",
      )}
    >
      <p role="alert" className="m-0 flex-1">
        {message}
      </p>
      <Button
        className="grid min-h-6 min-w-6 flex-none place-items-center rounded-[5px] p-[2px] cursor-pointer hover:bg-[rgba(208,112,85,0.14)] hover:text-ink focus-visible:outline-offset-2!"
        aria-label="Dismiss Space error"
        onClick={onDismiss}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={14} />
      </Button>
    </div>
  );
}
