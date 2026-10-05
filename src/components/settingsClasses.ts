/* Button and surface classes the settings screens share.
 *
 * These live apart from App.tsx so that no two components have to import from a
 * third to agree on a class. App.tsx still holds the settings modal itself; once
 * that moves, this module is imported only by the settings surfaces.
 */

/* Recover and Delete share this base; only their fill and hover border differ. */
export const SETTINGS_BATCH_BUTTON_CLASS =
  "inline-flex h-[27px] items-center justify-center rounded-[20px] whitespace-nowrap border border-rule px-[10px] cursor-pointer " +
  "font-sans text-[11px] font-medium transition-[transform,background,border-color,color,opacity] duration-[.18s] ease-out " +
  "motion-reduce:transition-none active:scale-[.96] disabled:cursor-not-allowed disabled:opacity-42";

export const SETTINGS_TAB_CLASS =
  "flex min-h-10 w-full items-center gap-2.5 rounded-sidebar border-0 bg-transparent px-[13px] text-left text-[13px] text-muted cursor-pointer " +
  "transition-[color,background,transform] duration-[.18s] ease-out motion-reduce:transition-none " +
  "hover:bg-[rgba(255,255,255,.06)] hover:text-ink active:scale-[.98]";

export const SETTINGS_TAB_ACTIVE_CLASS = "bg-surface text-ink font-semibold";

const SETTINGS_SELECT_BUTTON_BASE =
  "inline-flex h-[27px] items-center justify-center gap-1.5 rounded-[20px] whitespace-nowrap border border-ink px-[10px] cursor-pointer " +
  "font-sans text-[11px] font-medium transition-[transform,background,border-color,color,opacity] duration-[.18s] ease-out " +
  "motion-reduce:transition-none hover:bg-[#f2ece1] active:scale-[.96] disabled:cursor-not-allowed disabled:opacity-42";

export const SETTINGS_SELECT_BUTTON_CLASS = `${SETTINGS_SELECT_BUTTON_BASE} bg-ink text-paper`;
export const SETTINGS_SELECT_BUTTON_ACTIVE_CLASS = `${SETTINGS_SELECT_BUTTON_BASE} bg-[#f2ece1] text-paper`;

export const SETTINGS_CLOSE_BUTTON_CLASS =
  "icon-button small h-[30px] w-[30px] rounded-[7px] border-rule bg-surface";

export const SETTINGS_SCROLL_CLASS =
  "min-h-0 flex-auto overflow-y-auto p-[18px_3px_5px_0] [scrollbar-color:#4a4842_transparent] [scrollbar-width:thin] max-[700px]:overflow-visible";