import type { SVGProps } from "react";

/** One icon's artwork, as written to `./icons/` by `bun run icons`. */
export type IconData = { readonly viewBox: string; readonly body: string };

/**
 * Draws one icon. Import its data from its own file, such as `@inkling/ui/icons/Plus`:
 * that keeps the whole icon set out of the dev servers and the bundles.
 */
export function Icon({
  icon,
  size = 24,
  strokeWidth = 2,
  ...rest
}: {
  icon: IconData;
  size?: number | string;
  strokeWidth?: number;
} & Omit<SVGProps<SVGSVGElement>, "children" | "dangerouslySetInnerHTML">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={icon.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
      // The markup is ours: `bun run icons` generates it from the icon packages, never from user content.
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
