import { Input } from "@base-ui/react/input";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { glassClass } from "./Surface";

const EASE = "ease-[cubic-bezier(0.2,0.8,0.2,1)]";
const HIDDEN = "absolute w-0 opacity-0 pointer-events-none";

// Resting, the field is a pill naming the current view; focused, it grows into
// the full bar and shows the adornment and hint.
export function SearchField({
  expanded,
  rest,
  adornment,
  hint,
  ...inputProps
}: Omit<ComponentProps<"input">, "className"> & {
  expanded: boolean;
  rest: ReactNode;
  adornment?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label
      className={cx(
        glassClass(true),
        "relative flex min-w-0 items-center text-muted",
        `[transition-property:width,height,top,translate,padding] duration-320 ${EASE}`,
        "max-wide:w-auto max-wide:flex-auto wide:absolute wide:left-1/2",
        expanded
          ? // Important to beat the unlayered `.glass` shadow; liquid glass draws its own.
            "z-3 h-[50px] gap-3 rounded-search px-[15px] cursor-text not-data-liquid:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-10px_16px_rgba(0,0,0,0.3),0_18px_40px_rgba(0,0,0,0.5)]! wide:top-1 wide:w-[min(700px,100%-304px)] wide:[translate:-50%_0]"
          : // Text inputs match :focus-visible on mouse clicks too, so the ring
            // is limited to the resting pill.
            "h-[34px] gap-2 pr-4 pl-[13px] rounded-[17px] cursor-pointer whitespace-nowrap wide:top-1/2 wide:w-fit wide:[translate:-50%_-50%] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-3 has-[input:focus-visible]:outline-accent",
      )}
    >
      <span
        className={
          expanded
            ? "hidden"
            : "inline-flex items-center gap-2 font-body text-[13px]/4 font-semibold whitespace-nowrap text-ink [&_svg]:opacity-55"
        }
        aria-hidden="true"
      >
        {rest}
      </span>
      {adornment && (
        <span
          className={cx(
            "flex h-6 flex-none items-center justify-center overflow-hidden text-ink",
            `[&_svg]:block [&_svg]:flex-none [&_svg]:[transition:transform_0.25s_cubic-bezier(0.2,0.8,0.2,1),opacity_0.2s_ease]`,
            expanded
              ? `w-6 opacity-100 [transition:width_0.25s_cubic-bezier(0.2,0.8,0.2,1),margin-right_0.25s_cubic-bezier(0.2,0.8,0.2,1),opacity_0.2s_ease] [&_svg]:opacity-100`
              : `-mr-3 w-0 opacity-0 [transition:width_0.25s_cubic-bezier(0.2,0.8,0.2,1)_0.18s,margin-right_0.25s_cubic-bezier(0.2,0.8,0.2,1)_0.18s,opacity_0.2s_ease_0.18s] [&_svg]:[transform:translateX(-6px)_scale(0.7)] [&_svg]:opacity-0 ${HIDDEN}`,
          )}
          aria-hidden="true"
        >
          {adornment}
        </span>
      )}
      <Input
        className={cx(
          "min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink outline-0! placeholder:text-muted placeholder:indent-0.5",
          !expanded && HIDDEN,
        )}
        {...inputProps}
      />
      {hint && (
        <kbd
          className={cx(
            "font-mono text-[10px]/3 whitespace-nowrap text-muted max-wide:hidden",
            !expanded && HIDDEN,
          )}
        >
          {hint}
        </kbd>
      )}
    </label>
  );
}
