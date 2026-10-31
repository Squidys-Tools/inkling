import { Menu } from "@base-ui/react/menu";
import { PlusSignCircleIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { color, font, motion, radius, space, text } from "@inkling/ui/tokens.stylex";

const MAX_BADGES = 2;

const className =
  (...styles: stylex.StyleXStyles[]) =>
  () =>
    stylex.props(...styles).className ?? "";

/**
 * A faceted filter in the shape of shadcn/ui's data table example: a dashed
 * button that names the picked licenses, over a checklist with counts. Picking
 * keeps the list open, so several licenses combine.
 */
export function LicenseFilter({
  counts,
  selected,
  onChange,
  disabled,
}: {
  counts: ReadonlyArray<readonly [license: string, count: number]>;
  selected: ReadonlySet<string>;
  onChange: (selected: ReadonlySet<string>) => void;
  disabled: boolean;
}) {
  const toggle = (license: string) => {
    const next = new Set(selected);
    if (!next.delete(license)) next.add(license);
    onChange(next);
  };
  const picked = counts.filter(([license]) => selected.has(license));

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        disabled={disabled}
        className={(state) =>
          stylex.props(styles.trigger, state.open && styles.triggerOpen).className ?? ""
        }
      >
        <span {...stylex.props(styles.triggerIcon)}>
          <HugeiconsIcon icon={PlusSignCircleIcon} size={14} />
        </span>
        License
        {picked.length > 0 && (
          <>
            <span aria-hidden="true" {...stylex.props(styles.divider)} />
            {picked.length > MAX_BADGES ? (
              <span {...stylex.props(styles.badge)}>{picked.length} selected</span>
            ) : (
              picked.map(([license]) => (
                <span key={license} {...stylex.props(styles.badge)}>
                  {license}
                </span>
              ))
            )}
          </>
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          className={className(styles.positioner)}
        >
          <Menu.Popup aria-label="Filter by license" className={className(styles.popup)}>
            <div {...stylex.props(styles.list)}>
              {counts.map(([license, count]) => (
                <Menu.CheckboxItem
                  key={license}
                  checked={selected.has(license)}
                  onCheckedChange={() => toggle(license)}
                  className={(state) =>
                    stylex.props(styles.item, state.highlighted && styles.itemHighlighted)
                      .className ?? ""
                  }
                >
                  <span {...stylex.props(styles.box, selected.has(license) && styles.boxChecked)}>
                    <Menu.CheckboxItemIndicator className={className(styles.indicator)}>
                      <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={2.4} />
                    </Menu.CheckboxItemIndicator>
                  </span>
                  <span {...stylex.props(styles.itemLabel)}>{license}</span>
                  <span {...stylex.props(styles.itemCount)}>{count}</span>
                </Menu.CheckboxItem>
              ))}
            </div>
            {selected.size > 0 && (
              <Menu.Item
                onClick={() => onChange(new Set())}
                className={(state) =>
                  stylex.props(
                    styles.item,
                    styles.clear,
                    state.highlighted && styles.itemHighlighted,
                  ).className ?? ""
                }
              >
                Clear filter
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

const styles = stylex.create({
  trigger: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    maxWidth: "100%",
    minWidth: 0,
    height: "34px",
    paddingLeft: "10px",
    paddingRight: space.s3,
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: { default: color.borderStrong, ":hover": color.muted },
    backgroundColor: { default: "transparent", ":hover": color.overlayActive },
    color: { default: color.inkSoft, ":hover": color.ink },
    fontFamily: font.body,
    fontSize: text.sm,
    lineHeight: "16px",
    fontWeight: 500,
    whiteSpace: "nowrap",
    cursor: { default: "pointer", ":disabled": "default" },
    opacity: { default: 1, ":disabled": 0.5 },
    transitionProperty: "background-color, border-color, color",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  triggerOpen: { borderColor: color.muted, backgroundColor: color.overlayActive, color: color.ink },
  triggerIcon: { display: "inline-flex", flex: "none", color: color.muted },
  divider: {
    width: "1px",
    height: "14px",
    marginInline: "2px",
    backgroundColor: color.borderStrong,
  },
  badge: {
    minWidth: 0,
    overflow: "hidden",
    paddingInline: "7px",
    paddingBlock: "2px",
    borderRadius: "6px",
    backgroundColor: color.overlayActive,
    fontFamily: font.mono,
    fontSize: text.xs,
    lineHeight: "14px",
    fontWeight: 400,
    textOverflow: "ellipsis",
    color: color.ink,
  },
  positioner: { zIndex: 50 },
  popup: {
    width: "250px",
    padding: "5px",
    borderRadius: radius.tile,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.surface,
    boxShadow: `0 16px 40px ${color.shadow}`,
    outline: "none",
    transformOrigin: "top right",
  },
  list: {
    maxHeight: "300px",
    overflowY: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: `${color.borderStrong} transparent`,
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    width: "100%",
    height: "32px",
    paddingLeft: space.s2,
    paddingRight: "10px",
    borderRadius: "8px",
    fontFamily: font.body,
    fontSize: text.md,
    color: color.inkSoft,
    cursor: "pointer",
    outline: "none",
    userSelect: "none",
  },
  itemHighlighted: { backgroundColor: color.overlayActive, color: color.ink },
  clear: { justifyContent: "center", color: color.muted },
  box: {
    display: "grid",
    placeItems: "center",
    width: "15px",
    height: "15px",
    flex: "none",
    borderRadius: "4px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    color: color.frame,
  },
  boxChecked: { borderColor: color.ink, backgroundColor: color.ink },
  indicator: { display: "flex" },
  itemLabel: {
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemCount: { flex: "none", fontFamily: font.mono, fontSize: text.xs, color: color.muted },
});
