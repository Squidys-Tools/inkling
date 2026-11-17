import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon";
import PlayIcon from "@hugeicons/core-free-icons/PlayIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { color, font, motion, space } from "@inkling/ui/tokens.stylex";
import { ActionButton, CardRow, Panel, PanelBody, Section } from "./parts.tsx";
import { channelName } from "./updateModel.ts";
import { useAppUpdate } from "./useAppUpdate.ts";

export function GeneralPanel({
  version,
  onShowWelcome,
  onShowLicenses,
  onClose,
}: {
  version: string | null;
  onShowWelcome: () => void;
  onShowLicenses: () => void;
  onClose: () => void;
}) {
  const channel = useAppUpdate().state?.channel;
  return (
    <Panel title="General" note="Getting started, and what inkling is made of." onClose={onClose}>
      <PanelBody>
        <Section label="Getting started">
          <CardRow
            title="Welcome tour"
            description="Replay the screens from your first launch: saving things, finding them again, and keeping your library on this computer."
            action={
              <ActionButton icon={PlayIcon} onClick={onShowWelcome}>
                Show again
              </ActionButton>
            }
          />
        </Section>
        <Section label="About">
          <CardRow
            title={version ? `inkling ${version}` : "inkling"}
            description={channel && `${channelName(channel)} channel`}
          />
          <button type="button" onClick={onShowLicenses} {...stylex.props(styles.link)}>
            <span {...stylex.props(styles.linkText)}>
              <span {...stylex.props(styles.linkTitle)}>Open source licenses</span>
              <span {...stylex.props(styles.linkDescription)}>
                The projects inkling is built on, and the terms they come with.
              </span>
            </span>
            <span aria-hidden="true" {...stylex.props(styles.chevron)}>
              <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
            </span>
          </button>
        </Section>
      </PanelBody>
    </Panel>
  );
}

const styles = stylex.create({
  link: {
    display: "flex",
    alignItems: "center",
    gap: space.s4,
    width: "100%",
    minHeight: "62px",
    paddingInline: space.s4,
    paddingBlock: "14px",
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.border,
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    fontFamily: font.body,
    textAlign: "start",
    cursor: "pointer",
    transitionProperty: "background-color",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-2px",
  },
  linkText: { display: "flex", flex: "1 1 auto", flexDirection: "column", gap: space.s1 },
  linkTitle: { fontSize: "13.5px", lineHeight: "18px", fontWeight: 500, color: color.ink },
  linkDescription: { fontSize: "12.5px", lineHeight: "17px", color: color.muted },
  chevron: { display: "inline-flex", color: color.faint },
});
