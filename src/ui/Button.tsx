import { Button as BaseButton } from "@base-ui/react/button";
import { cx } from "./cx";

const variants = {
  plain: "",
  text: "text-[13px] text-accent underline underline-offset-3 cursor-pointer",
  primary:
    "m-0 appearance-none rounded-md bg-green px-3 py-2 text-[12px] font-semibold text-[#14201a] cursor-pointer [transition:scale_0.16s_cubic-bezier(0.23,1,0.32,1),background-color_0.18s_ease] hover:enabled:bg-[#91b19d] active:enabled:scale-96 disabled:cursor-wait disabled:opacity-65",
};

export type ButtonProps = Omit<BaseButton.Props, "className"> & {
  className?: string;
  variant?: keyof typeof variants;
};

export function Button({ variant = "plain", className, ...props }: ButtonProps) {
  return <BaseButton className={cx("ui-button", variants[variant], className)} {...props} />;
}
