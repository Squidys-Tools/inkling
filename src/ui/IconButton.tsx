import { Button as BaseButton } from "@base-ui/react/button";
import { cx } from "./cx";

const sizes = { xs: "size-5", sm: "size-[26px]" };

export const iconButtonClass = (size: keyof typeof sizes) =>
  cx(
    "inline-grid place-items-center rounded-lg border border-transparent bg-transparent text-muted cursor-pointer transition-[background-color,color,border-color] duration-180 ease-[ease] hover:border-border hover:bg-surface hover:text-ink [&_svg]:block",
    sizes[size],
  );

export function IconButton({
  label,
  size,
  className,
  ...props
}: Omit<BaseButton.Props, "className"> & {
  label: string;
  size: keyof typeof sizes;
  className?: string;
}) {
  return (
    <BaseButton
      aria-label={label}
      data-tooltip={label}
      className={cx(iconButtonClass(size), className)}
      {...props}
    />
  );
}
