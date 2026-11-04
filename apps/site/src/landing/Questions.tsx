import * as stylex from "@stylexjs/stylex";
import { Accordion } from "@base-ui/react/accordion";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { useState } from "react";
import { base } from "./base.ts";
import { landing, media } from "./landing.stylex.ts";

export function Questions({ items }: { items: { id: string; title: string; body: string }[] }) {
  const [open, setOpen] = useState<string[]>([]);
  return (
    <Accordion.Root value={open} onValueChange={setOpen}>
      {items.map(({ id, title, body }) => {
        const expanded = open.includes(id);
        return (
          <Accordion.Item key={id} value={id} {...stylex.props(styles.item)}>
            <Accordion.Header {...stylex.props(base.flush, styles.header)}>
              <Accordion.Trigger {...stylex.props(base.button, styles.trigger)}>
                <span>{title}</span>
                <span aria-hidden="true" {...stylex.props(styles.chevron)}>
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 36 36"
                    fill="none"
                    {...stylex.props(styles.disc)}
                  >
                    <circle
                      cx="18"
                      cy="18"
                      r="18"
                      {...stylex.props(styles.ground, expanded && styles.groundOpen)}
                    />
                    <path
                      d="m12 15 6 6 6-6"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      {...stylex.props(styles.mark, expanded && styles.markOpen)}
                    />
                  </svg>
                </span>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel {...stylex.props(styles.panel)}>
              <p {...stylex.props(base.flush, styles.answer)}>{body}</p>
            </Accordion.Panel>
          </Accordion.Item>
        );
      })}
    </Accordion.Root>
  );
}

const styles = stylex.create({
  item: { overflow: "hidden" },
  header: { fontSize: "inherit", fontWeight: 500 },
  trigger: {
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: { default: "24px", [media.phone]: "16px" },
    width: "100%",
    minHeight: { default: "80px", [media.phone]: "78px" },
    paddingBlock: { default: "22px", [media.phone]: "20px" },
    paddingInline: 0,
    borderStyle: "none",
    backgroundColor: "transparent",
    color: landingColor.sheetInk,
    fontSize: { default: "22px", [media.phone]: "19px" },
    fontWeight: 400,
    lineHeight: 1.3,
    letterSpacing: "-0.025em",
    textAlign: "left",
    outline: { default: null, ":focus-visible": `3px solid ${landingColor.sheetInk}` },
    outlineOffset: { default: null, ":focus-visible": "-5px" },
  },
  chevron: { display: "grid", placeItems: "center", flex: "none", width: "36px", height: "36px" },
  disc: { display: "block", overflow: "visible" },
  ground: { fill: landingColor.sheetDisc },
  groundOpen: { fill: landingColor.sheetInk },
  mark: {
    stroke: landingColor.sheetInk,
    transformOrigin: "18px 18px",
    transitionProperty: "transform",
    transitionDuration: { default: "0.22s", [media.reduced]: "0s" },
    transitionTimingFunction: landing.controlEase,
  },
  markOpen: { stroke: landingColor.sheet, transform: "rotate(180deg)" },
  panel: {
    overflow: "hidden",
    height: {
      default: "var(--accordion-panel-height)",
      ":is([data-starting-style], [data-ending-style])": 0,
    },
    opacity: { default: 1, ":is([data-starting-style], [data-ending-style])": 0 },
    transitionProperty: "height, opacity",
    transitionDuration: { default: "0.22s", [media.reduced]: "0s" },
    transitionTimingFunction: landing.ease,
  },
  answer: {
    maxWidth: "48ch",
    paddingBlock: "0 26px",
    paddingInline: { default: "0 44px", [media.phone]: "0 8px" },
    color: landingColor.sheetMuted,
    fontSize: { default: "17px", [media.phone]: "16px" },
    lineHeight: 1.6,
  },
});
