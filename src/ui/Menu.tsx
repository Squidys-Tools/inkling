import type { FocusEvent } from "react";

export const MENU_POPUP_MOTION =
  "outline-none transition-[opacity,transform] duration-120 ease-[cubic-bezier(0.23,1,0.32,1)] data-starting-style:opacity-0 data-starting-style:[transform:scale(0.97)] motion-reduce:transition-none";

export const MENU_ITEM =
  "flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-[8px] py-0 pr-2.5 pl-2 text-left font-body text-[13px] leading-[normal] outline-none data-highlighted:bg-glass-active data-highlighted:text-ink";

// A pointer open lands Base UI's focus on the popup; the first item takes it
// instead, so the menu opens highlighted as a keyboard open does.
export function focusFirstMenuItem(event: FocusEvent<HTMLElement>) {
  if (event.target !== event.currentTarget) return;
  if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
    return;
  event.currentTarget
    .querySelector<HTMLElement>("[role^=menuitem]")
    ?.focus({ preventScroll: true });
}
