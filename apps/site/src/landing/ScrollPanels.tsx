import * as stylex from "@stylexjs/stylex";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { useMotionValueEvent, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { base } from "./base.ts";
import { useCalm, useMediaQuery } from "./environment.ts";
import { landing, media } from "./landing.stylex.ts";

type Panel = {
  id: string;
  title: string;
  body: string;
  caption: string;
  picture?: { src: string; alt: string };
};

const panels: Panel[] = [
  {
    id: "pictures",
    title: "The picture you paused on.",
    body: "Photos, screenshots, and the details you want to remember. Keep them together instead of losing them in the camera roll.",
    picture: {
      src: "/media/stories/jellyfish.jpg",
      alt: "An orange jellyfish drifting in deep blue water.",
    },
    caption: "A little otherworldly.",
  },
  {
    id: "thoughts",
    title: "The thought you almost lost.",
    body: "A plan for the weekend. A good sentence. A note to yourself. Your words belong beside the pictures, not in another pile.",
    caption: "A weekend by the water",
  },
  {
    id: "spaces",
    title: "A corner of your own.",
    body: "Put favourites in a regular Space, or let a Smart Space collect items that match a saved search. A little structure, only when you want it.",
    picture: {
      src: "/demo/assets/animal-1020-CF3jCN2d.jpg",
      alt: "A brown bear beside a quiet lake and forested mountains.",
    },
    caption: "Out in nature",
  },
];

function PanelPicture({ panel, pinned }: { panel: Panel; pinned: boolean }) {
  return panel.picture ? (
    <img
      src={panel.picture.src}
      alt={panel.picture.alt}
      width="720"
      height="960"
      loading="lazy"
      {...stylex.props(
        base.image,
        styles.image,
        pinned ? styles.pinnedImage : styles.inlineImage,
        pinned && panel.id === "pictures" && styles.jellyfish,
        pinned && panel.id === "spaces" && styles.bear,
      )}
    />
  ) : (
    <div {...stylex.props(styles.note, pinned ? styles.pinnedNote : styles.inlineNote)}>
      <span {...stylex.props(styles.noteKicker)}>A note to myself</span>
      <p {...stylex.props(base.flush, styles.noteTitle)}>
        A weekend
        <br />
        by the water.
      </p>
      <p {...stylex.props(base.flush, styles.noteBody)}>
        Bring a notebook, a camera and a warm layer. Leave room for the unplanned.
      </p>
    </div>
  );
}

export function ScrollPanels() {
  const root = useRef<HTMLDivElement>(null);
  const calm = useCalm();
  const fits = useMediaQuery("(min-height: 760px)");
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: root, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (value) =>
    setActive(Math.min(panels.length - 1, Math.floor(Math.max(0, value) * panels.length))),
  );
  const pinned = fits && !calm;
  return (
    <div ref={root} {...stylex.props(styles.root, pinned && styles.pinnedRoot)}>
      <div {...stylex.props(base.frame, pinned && styles.stage)}>
        <div
          aria-label="A little more about your library"
          {...stylex.props(styles.panels, pinned && styles.pinnedPanels)}
        >
          {panels.map((panel, index) => {
            const current = active === index;
            return (
              <section
                key={panel.id}
                aria-labelledby={`panel-${panel.id}`}
                {...stylex.props(
                  styles.panel,
                  pinned ? styles.pinnedPanel : styles.stackedPanel,
                  pinned && current && styles.currentPanel,
                )}
              >
                <h3
                  id={`panel-${panel.id}`}
                  aria-current={pinned && current ? "step" : undefined}
                  {...stylex.props(
                    base.flush,
                    styles.title,
                    pinned ? styles.pinnedTitle : styles.stackedTitle,
                    pinned && current && styles.currentTitle,
                  )}
                >
                  {panel.title}
                </h3>
                <div
                  {...stylex.props(
                    pinned ? styles.pinnedBody : styles.stackedBody,
                    pinned && current && styles.currentBody,
                  )}
                >
                  <div {...stylex.props(pinned && styles.clip)}>
                    <p {...stylex.props(base.flush, styles.text, !pinned && styles.stackedText)}>
                      {panel.body}
                    </p>
                  </div>
                </div>
                <figure
                  {...stylex.props(
                    base.flush,
                    styles.inlineFigure,
                    pinned ? styles.hiddenFigure : styles.stackedFigure,
                  )}
                >
                  <PanelPicture panel={panel} pinned={false} />
                  <figcaption {...stylex.props(styles.caption, styles.inlineCaption)}>
                    {panel.caption}
                  </figcaption>
                </figure>
              </section>
            );
          })}
        </div>
        <div aria-hidden="true" {...stylex.props(styles.pictures, pinned && styles.pinnedPictures)}>
          {panels.map((panel, index) => (
            <figure
              key={panel.id}
              {...stylex.props(
                base.flush,
                styles.picture,
                active !== index && styles.pictureAway,
                calm && styles.still,
              )}
            >
              <PanelPicture panel={panel} pinned />
            </figure>
          ))}
          <p {...stylex.props(base.flush, styles.caption, styles.pinnedCaption)}>
            {panels[active]!.caption}
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = stylex.create({
  root: {
    marginTop: { default: "72px", [media.phone]: "30px" },
    paddingBottom: { default: "80px", [media.phone]: "40px" },
  },
  pinnedRoot: { height: { default: "260svh", [media.phone]: "250svh" }, paddingBottom: 0 },
  stage: {
    boxSizing: "border-box",
    position: "sticky",
    top: 0,
    minHeight: "100svh",
    display: "grid",
    gridTemplateColumns: { default: "1fr 1.05fr", [media.tablet]: "1fr 1fr", [media.phone]: "1fr" },
    gap: { default: "9%", [media.tablet]: "5%", [media.phone]: "24px" },
    alignItems: "center",
    alignContent: { default: null, [media.phone]: "center" },
    paddingBlock: { default: "70px", [media.phone]: "24px" },
  },
  panels: { display: "grid", gap: { default: "36px", [media.phone]: "28px" } },
  pinnedPanels: {
    display: "flex",
    flexDirection: "column",
    gap: { default: "16px", [media.phone]: "6px" },
  },
  panel: { minWidth: 0 },
  pinnedPanel: {
    boxSizing: "border-box",
    padding: { default: "26px 28px", [media.tablet]: "22px", [media.phone]: "14px 18px" },
    borderRadius: { default: "20px", [media.phone]: "15px" },
    backgroundColor: "transparent",
    transitionProperty: "background-color",
    transitionDuration: { default: "0.3s", [media.reduced]: "0s" },
    transitionTimingFunction: "ease",
  },
  currentPanel: { backgroundColor: landingColor.surfaceAlt },
  stackedPanel: {
    display: { default: "grid", [media.phone]: "block" },
    gridTemplateColumns: "1fr 1fr",
    columnGap: "9%",
    paddingBlock: { default: "30px", [media.phone]: "26px" },
  },
  title: {
    maxWidth: "17ch",
    fontSize: { default: "clamp(27px, 2.8vw, 42px)", [media.phone]: "30px" },
    fontWeight: 400,
    lineHeight: 1.14,
    letterSpacing: "-0.04em",
  },
  pinnedTitle: {
    maxWidth: { default: "17ch", [media.phone]: "none" },
    fontSize: { default: "clamp(27px, 2.8vw, 42px)", [media.phone]: "24px" },
    color: landingColor.muted,
    transitionProperty: "color",
    transitionDuration: { default: "0.2s", [media.reduced]: "0s" },
    transitionTimingFunction: "ease",
  },
  currentTitle: { color: landingColor.ink },
  stackedTitle: { alignSelf: "end" },
  pinnedBody: {
    display: "grid",
    gridTemplateRows: "0fr",
    opacity: 0,
    transitionProperty: "grid-template-rows, opacity",
    transitionDuration: { default: "0.38s, 0.24s", [media.reduced]: "0s" },
    transitionTimingFunction: `${landing.controlEase}, ease`,
  },
  currentBody: { gridTemplateRows: "1fr", opacity: 1 },
  stackedBody: { gridColumn: "1" },
  clip: { overflow: "hidden" },
  text: {
    maxWidth: { default: "35ch", [media.phone]: "none" },
    marginTop: { default: "24px", [media.phone]: "16px" },
    color: landingColor.muted,
    fontSize: { default: "18px", [media.tablet]: "17px", [media.phone]: "16px" },
    lineHeight: { default: 1.6, [media.phone]: 1.5 },
  },
  stackedText: { fontSize: { default: "18px", [media.tablet]: "17px", [media.phone]: "17px" } },
  inlineFigure: { marginTop: "32px" },
  // Kept for screen readers; the pinned stage shows the pictures beside the panels.
  hiddenFigure: {
    position: "absolute",
    width: "1px",
    height: "1px",
    marginTop: 0,
    overflow: "hidden",
    clipPath: "inset(50%)",
  },
  stackedFigure: {
    gridColumn: "2",
    gridRow: "1 / 3",
    marginTop: { default: 0, [media.phone]: "24px" },
  },
  image: { width: "100%", objectFit: "cover" },
  inlineImage: { height: { default: "430px", [media.phone]: "330px" }, borderRadius: "24px" },
  pinnedImage: { height: "100%", borderRadius: { default: "24px", [media.phone]: "18px" } },
  note: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: { default: "30px", [media.phone]: "16px" },
    padding: { default: "44px", [media.tablet]: "32px", [media.phone]: "24px" },
    borderRadius: { default: "24px", [media.phone]: "18px" },
    backgroundColor: landingColor.ink,
    color: landingColor.paper,
  },
  inlineNote: { minHeight: { default: "430px", [media.phone]: "330px" } },
  pinnedNote: { flex: 1, minHeight: 0 },
  noteKicker: { fontSize: { default: "15px", [media.phone]: "13px" } },
  noteTitle: {
    fontSize: { default: "clamp(32px, 4vw, 60px)", [media.phone]: "34px" },
    lineHeight: 1.06,
    letterSpacing: "-0.05em",
  },
  noteBody: {
    maxWidth: "29ch",
    fontSize: { default: "18px", [media.phone]: "15px" },
    lineHeight: 1.55,
  },
  caption: { color: landingColor.muted, fontSize: "15px" },
  inlineCaption: { marginTop: "16px" },
  pictures: { display: "none" },
  pinnedPictures: {
    display: "block",
    position: "relative",
    height: { default: "min(580px, 68svh)", [media.phone]: "33svh" },
    maxHeight: { default: null, [media.phone]: "300px" },
    minWidth: 0,
  },
  picture: {
    position: "absolute",
    inset: { default: "0 0 44px", [media.phone]: "0 0 32px" },
    display: "flex",
    flexDirection: "column",
    gap: { default: "20px", [media.phone]: "12px" },
    pointerEvents: "none",
    transitionProperty: "opacity, transform",
    transitionDuration: "0.38s",
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
  pictureAway: { opacity: 0, transform: "translateY(22px) scale(1.025)" },
  still: { transitionDuration: "0s" },
  jellyfish: { objectPosition: "42% center" },
  bear: { objectPosition: "40% center" },
  pinnedCaption: {
    position: "absolute",
    bottom: 0,
    left: 0,
    fontSize: { default: "15px", [media.phone]: "13px" },
    lineHeight: 1.5,
  },
});
