import { ArrowLeft01Icon, ViewSidebarLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { Surface } from "../../ui/Surface";

export function SidebarOpenButton({
  edgeToggle,
  onOpen,
}: {
  edgeToggle: boolean;
  onOpen: () => void;
}) {
  return (
    <Surface
      liquid
      render={<button type="button" />}
      className={cx(
        "sidebar-toggle absolute top-1/2 left-0 grid size-[34px] -translate-y-1/2 place-items-center rounded-[17px] p-0 text-ink-soft cursor-pointer transition-[color,scale] duration-180 ease-[ease] hover:text-ink active:scale-96",
        edgeToggle && "wide:hidden",
      )}
      aria-label="Open sidebar"
      data-tooltip="Open sidebar"
      aria-expanded={false}
      aria-controls="library-navigation"
      onClick={onOpen}
    >
      <HugeiconsIcon icon={ViewSidebarLeftIcon} size={17} />
    </Surface>
  );
}

// Settings → Appearance "Edge grip". Closed, a faint grip stays on the window's
// edge so there is always a way back. Narrow windows keep their buttons.
export function SidebarEdgeGrip({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const label = isOpen ? "Close sidebar" : "Open sidebar";
  return (
    <Button
      className={cx(
        "group absolute top-[calc(4px+var(--spacing-titlebar))] bottom-5 z-32 hidden p-0 cursor-pointer transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:outline-none! wide:block",
        isOpen ? "left-[calc(var(--spacing-sidebar)-4px)] w-[18px]" : "left-0 w-3.5",
      )}
      aria-label={label}
      aria-expanded={isOpen}
      aria-controls="library-navigation"
      onClick={onToggle}
    >
      <span
        className={cx(
          "absolute top-1/2 h-10 w-1 -translate-y-1/2 rounded-[2px] bg-ink transition-[opacity,height] duration-180 ease-[ease] group-hover:h-14 group-hover:opacity-60 group-focus-visible:h-14 group-focus-visible:opacity-60",
          isOpen ? "left-[9px] opacity-0" : "left-[5px] opacity-22",
        )}
      />
      <Surface
        render={<span />}
        className={cx(
          "pointer-events-none absolute top-1/2 -mt-3.5 grid size-7 place-items-center rounded-full text-ink opacity-0 scale-85 transition-[opacity,scale] duration-180 ease-[ease] group-hover:pointer-events-auto group-hover:opacity-100 group-hover:scale-100 group-focus-visible:pointer-events-auto group-focus-visible:opacity-100 group-focus-visible:scale-100",
          isOpen ? "left-[26px]" : "left-[22px] [&_svg]:rotate-180",
        )}
        data-tooltip={`${label} · Ctrl+\\`}
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
      </Surface>
    </Button>
  );
}
