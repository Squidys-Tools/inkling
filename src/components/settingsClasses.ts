/* Button classes the settings surfaces share.
 *
 * These live apart from App.tsx because two files use them: the settings modal
 * itself and the extension pairing panel it hosts. Recover and Delete share the
 * base; only their fill and hover border differ. */
export const SETTINGS_BATCH_BUTTON_CLASS =
  "inline-flex h-[27px] items-center justify-center rounded-[20px] whitespace-nowrap border border-rule px-[10px] cursor-pointer " +
  "font-sans text-[11px] font-medium transition-[transform,background,border-color,color,opacity] duration-[.18s] ease-out " +
  "motion-reduce:transition-none active:scale-[.96] disabled:cursor-not-allowed disabled:opacity-42";