import * as stylex from "@stylexjs/stylex";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { bindingsFor } from "@inkling/contracts/shortcuts";
import { color, font } from "@inkling/ui/tokens.stylex";
import type { ReactNode } from "react";
import { platform } from "../desktop.ts";
import { KeptFloating } from "./KeptFloating.tsx";
import { MemoryMatch } from "./MemoryMatch.tsx";
import { ReadsPictures } from "./ReadsPictures.tsx";
import { SplitText } from "./SplitText.tsx";

export const LAST_SCREEN = 4;
/**
 * When each screen's headline starts, in seconds. Screens whose demo opens the
 * scene hold the headline back; the rest of the copy follows it.
 */
const HEADLINE_DELAY = [0.15, 0.2, 0.45, 0.45, 0.15] as const;

export type ScreenNav = {
  onAdvance: () => void;
  onBack: () => void;
  onSkip: () => void;
};

const modifier = platform === "darwin" ? "⌘" : "Ctrl";
const searchKey = (bindingsFor("search", platform)[0]?.key ?? "k").toUpperCase();

function Keys({
  keys,
  hint,
  delay,
  style,
}: {
  keys: string[];
  hint: string;
  delay: number;
  style: stylex.StyleXStyles;
}) {
  return (
    <div {...stylex.props(styles.keys, styles.rise, styles.delay(delay), style)}>
      {keys.map((key, i) => (
        <kbd key={key} {...stylex.props(styles.kbd, styles.delay(delay + 0.7 + i * 0.12))}>
          {key}
        </kbd>
      ))}
      <span {...stylex.props(styles.keysHint)}>{hint}</span>
    </div>
  );
}

function Actions({
  screen,
  nav,
  style,
}: {
  screen: number;
  nav: ScreenNav;
  style: stylex.StyleXStyles;
}) {
  return (
    <div {...stylex.props(styles.actions, style)}>
      <button type="button" {...stylex.props(styles.primary)} onClick={nav.onAdvance}>
        {screen === LAST_SCREEN ? "Open my library" : "Continue"}
      </button>
      {screen > 0 ? (
        <button type="button" {...stylex.props(styles.quiet)} onClick={nav.onBack}>
          Back
        </button>
      ) : null}
      <button type="button" {...stylex.props(styles.quiet)} onClick={nav.onSkip}>
        Skip
      </button>
    </div>
  );
}

function Body({
  children,
  delay,
  style,
}: {
  children: ReactNode;
  delay: number;
  style: stylex.StyleXStyles;
}) {
  return <p {...stylex.props(styles.body, styles.rise, styles.delay(delay), style)}>{children}</p>;
}

/** The copy and demo of one welcome screen, laid out on the 960x540 stage. */
export function Screen({
  screen,
  nav,
  reducedMotion,
}: {
  screen: number;
  nav: ScreenNav;
  reducedMotion: boolean;
}) {
  const headlineDelay = HEADLINE_DELAY[screen] ?? 0;
  const copyDelay = headlineDelay + 0.5;
  switch (screen) {
    case 0:
      return (
        <>
          <SplitText
            text="Drop something in."
            delay={headlineDelay}
            style={[styles.headline, styles.at(40, 128)]}
          />
          <Body delay={copyDelay} style={styles.at(40, 214)}>
            Paste a link, drop in a file, or grab a screenshot.
            <br />
            It&apos;s kept the moment it lands. No folders to pick.
          </Body>
          <Keys
            keys={[modifier, "V"]}
            hint="works anywhere in inkling"
            delay={copyDelay}
            style={styles.at(40, 300)}
          />
          <Actions screen={screen} nav={nav} style={styles.at(40, 362)} />
        </>
      );
    case 1:
      return (
        <>
          <KeptFloating reducedMotion={reducedMotion} />
          <SplitText
            text="Kept as it came."
            delay={headlineDelay}
            style={[styles.headline, styles.centered, styles.top(137)]}
          />
          <Body delay={copyDelay} style={[styles.centered, styles.top(222)]}>
            Articles, photos, PDFs, quotes, notes and posts each get
            <br />
            their own card, right away. Reading and indexing happen
            <br />
            quietly while you keep going.
          </Body>
          <Actions screen={screen} nav={nav} style={[styles.centeredRow, styles.top(350)]} />
        </>
      );
    case 2:
      return (
        <>
          <MemoryMatch reducedMotion={reducedMotion} />
          <SplitText
            text="Half a memory is enough."
            delay={headlineDelay}
            style={[styles.headline, styles.centered, styles.top(326)]}
          />
          <Body delay={copyDelay} style={[styles.centered, styles.top(408)]}>
            Describe it the way it comes back to you. Search runs on this
            <br />
            computer, so nothing you save leaves it.
          </Body>
          <Actions screen={screen} nav={nav} style={[styles.centeredRow, styles.top(492)]} />
        </>
      );
    case 3:
      return (
        <>
          <ReadsPictures reducedMotion={reducedMotion} />
          <SplitText
            text="It reads your pictures, too."
            delay={headlineDelay}
            style={[styles.headline, styles.wrapped, styles.at(24, 76)]}
          />
          <Body delay={copyDelay} style={styles.at(24, 233)}>
            Words inside screenshots, photos and PDFs are
            <br />
            searchable. Remember one word, find the whole
            <br />
            thing. All on this computer.
          </Body>
          <Keys
            keys={[modifier, searchKey]}
            hint="to search from anywhere"
            delay={copyDelay}
            style={styles.at(24, 352)}
          />
          <Actions screen={screen} nav={nav} style={styles.at(24, 414)} />
        </>
      );
    default:
      return (
        <>
          <SplitText
            text="It's all yours."
            delay={headlineDelay}
            style={[styles.headline, styles.at(400, 116)]}
          />
          <Body delay={copyDelay} style={styles.at(400, 202)}>
            Your library lives on this computer, not in an
            <br />
            account. Export a full copy whenever you like.
            <br />
            inkling only goes online to fetch the links you save.
          </Body>
          <nav aria-label="Where to export" {...stylex.props(styles.crumb, styles.at(400, 322))}>
            <ol {...stylex.props(styles.crumbList)}>
              <li {...stylex.props(styles.crumbItem, styles.rise, styles.delay(copyDelay))}>
                Settings
              </li>
              <Separator delay={copyDelay + 0.26} />
              <li {...stylex.props(styles.crumbItem, styles.rise, styles.delay(copyDelay + 0.34))}>
                Library
              </li>
              <Separator delay={copyDelay + 0.6} />
              <li {...stylex.props(styles.crumbItem, styles.rise, styles.delay(copyDelay + 0.68))}>
                <span aria-current="page" {...stylex.props(styles.crumbCurrent)}>
                  Export a copy
                </span>
              </li>
            </ol>
          </nav>
          <Actions screen={screen} nav={nav} style={styles.at(400, 378)} />
        </>
      );
  }
}

function Separator({ delay }: { delay: number }) {
  return (
    <li
      aria-hidden="true"
      role="presentation"
      {...stylex.props(styles.separator, styles.rise, styles.delay(delay))}
    >
      <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
    </li>
  );
}

const reduced = "@media (prefers-reduced-motion: reduce)";
const rise = stylex.keyframes({ from: { opacity: 0, translate: "0 14px" } });
const keyPress = stylex.keyframes({
  "45%": { translate: "0 2px", borderBottomWidth: "1px", backgroundColor: color.border },
});

const styles = stylex.create({
  at: (left: number, top: number) => ({ left, top }),
  top: (top: number) => ({ top }),
  delay: (seconds: number) => ({ animationDelay: `${seconds}s` }),
  rise: {
    animationName: { default: rise, [reduced]: "none" },
    animationDuration: "640ms",
    animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    animationFillMode: "both",
  },
  headline: {
    position: "absolute",
    margin: 0,
    fontSize: 68,
    fontWeight: 500,
    letterSpacing: "-0.03em",
    lineHeight: 1.05,
    whiteSpace: "nowrap",
  },
  wrapped: { width: 440, whiteSpace: "normal" },
  centered: { left: 0, right: 0, textAlign: "center" },
  body: {
    position: "absolute",
    margin: 0,
    fontSize: 21,
    lineHeight: 1.55,
    color: color.muted,
    whiteSpace: "nowrap",
  },
  keys: {
    position: "absolute",
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontFamily: font.body,
    fontSize: 15,
    color: color.muted,
  },
  keysHint: { marginLeft: 8 },
  kbd: {
    minWidth: 34,
    boxSizing: "border-box",
    paddingBlock: 5,
    paddingInline: 11,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderStyle: "solid",
    borderColor: color.border,
    borderRadius: 8,
    backgroundColor: color.surface,
    color: color.ink,
    fontFamily: "inherit",
    fontSize: 15,
    textAlign: "center",
    animationName: { default: keyPress, [reduced]: "none" },
    animationDuration: "260ms",
    animationTimingFunction: "ease-out",
  },
  actions: { position: "absolute", display: "flex", alignItems: "center", gap: 18 },
  centeredRow: { left: 0, right: 0, justifyContent: "center" },
  primary: {
    minWidth: 204,
    boxSizing: "border-box",
    height: 54,
    paddingBlock: 0,
    paddingInline: 32,
    borderWidth: 0,
    borderRadius: 999,
    backgroundColor: color.ink,
    color: color.window,
    fontFamily: "inherit",
    fontSize: 19,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: 3,
  },
  quiet: {
    height: 54,
    paddingBlock: 0,
    paddingInline: 4,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: { default: color.muted, ":hover": color.ink, ":focus-visible": color.ink },
    fontFamily: "inherit",
    fontSize: 18,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  crumb: { position: "absolute" },
  crumbList: {
    margin: 0,
    padding: 0,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    listStyle: "none",
    fontFamily: font.body,
    fontSize: 15,
    lineHeight: 1.4,
    color: color.muted,
  },
  crumbItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  crumbCurrent: { color: color.accent },
  separator: { display: "inline-flex", opacity: 0.8 },
});
