import type { ReactNode, RefObject } from "react";
import { cx } from "../../ui/cx";

// An open item covers the library, which stays mounted underneath so the item
// can fly back into its card.
export function LibraryFrame({
  ref,
  codexSidebar,
  isSidebarOpen,
  inert,
  children,
}: {
  ref: RefObject<HTMLElement | null>;
  codexSidebar: boolean;
  isSidebarOpen: boolean;
  inert: boolean;
  children: ReactNode;
}) {
  return (
    <main
      className={cx(
        "relative flex h-screen min-h-0 w-auto min-w-0 flex-auto flex-col overflow-hidden pt-(--main-pad-top) pr-(--main-pad-x) pb-(--main-pad-bottom) pl-(--main-pad-x) transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] [--library-top:var(--main-pad-top)] [--main-pad-bottom:30px] [--main-pad-top:calc(4px_+_var(--spacing-titlebar))] [--main-pad-x:14px] [--stage-background:var(--color-canvas)]",
        "wide:border-y wide:border-r-0 wide:border-border wide:bg-frame wide:transition-[margin-left,padding,border-radius] wide:[--stage-background:var(--color-frame)]",
        codexSidebar && "motion-reduce:transition-none",
        // Codex retains a rail when compact; Classic closes to the window edge.
        codexSidebar || isSidebarOpen
          ? "wide:ml-(--spacing-sidebar) wide:rounded-l-frame wide:border-l"
          : "wide:ml-0 wide:rounded-none",
        "max-[1120px]:w-[calc(100vw_-_var(--spacing-sidebar))] max-[780px]:w-full max-[780px]:transition-none max-[780px]:[--library-top:42px] max-[780px]:[--main-pad-bottom:24px] max-[780px]:[--main-pad-top:12px] max-[780px]:[--main-pad-x:18px]",
      )}
      ref={ref}
      inert={inert}
    >
      <section className="flex-none max-[780px]:pt-[30px]"></section>
      {children}
    </main>
  );
}
