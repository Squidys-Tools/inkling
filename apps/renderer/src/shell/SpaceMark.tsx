import type { SpaceColor } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { spaceColor } from "@inkling/ui/tokens.stylex";

const blot =
  "M-96.539 5.45c-1.2 0-2.475-0.125-4-0.7-1.1-0.375-2.125-1-3.35-1.2-2.225-0.375-4.1-0.15-5.775 0.775-1.55 0.825-2.925 2.275-3.725 3.925-0.975 2.075-0.75 4.375-2.4 6.575-0.9 1.275-1.6 1.675-2.4 2.8-0.85 1.2-1.325 2.4-1.35 4.05-0.075 4.8 4.375 10.35 9.225 12.05 2.025 0.65 3.7 0.55 5.45-0.075 1-0.35 2.175-0.95 3.175-1.325 1.325-0.375 2.375-0.5 3.875-0.35 1.275 0.125 2.375 0.425 3.6 0.375 3.275-0.075 5.65-2.175 5.65-5.95 0-1.4-0.25-2.475-0.15-4.1 0.3-3.05 1.925-4.025 2.75-6.475 0.925-3.1 0.4-6.95-3.1-9.15-1.1-0.65-2.3-1.3-3.875-1.45-0.95-0.025-1.825 0.1-2.775 0.175l-0.825 0.05z";

/** A Space's ink blot in its color. */
export function SpaceMark({ color, small = false }: { color: SpaceColor; small?: boolean }) {
  return (
    <svg
      width={small ? 13 : 15}
      height={small ? 12 : 14}
      viewBox="-121.289 2 37.5 34"
      aria-hidden="true"
      {...stylex.props(styles[color])}
    >
      <path fill="currentColor" d={blot} />
    </svg>
  );
}

const styles = stylex.create({
  orange: { color: spaceColor.orange },
  green: { color: spaceColor.green },
  blue: { color: spaceColor.blue },
  pink: { color: spaceColor.pink },
  purple: { color: spaceColor.purple },
  yellow: { color: spaceColor.yellow },
});
