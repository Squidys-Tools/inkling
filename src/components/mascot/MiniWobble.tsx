/** Tiny wavy placeholder that keeps the sidebar slot alive while the mascot works the search field. */
export function MiniWobble({ size = 22 }: { size?: number }) {
  return (
    <svg
      className="mini-wobble"
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M38 -8C34 -30 12 -40 -8 -36C-30 -32 -40 -12 -35 8C-30 28 -12 38 8 35C28 32 42 14 38 -8Z"
        fill="var(--ink)"
      />
    </svg>
  );
}
