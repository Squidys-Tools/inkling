import * as React from "react";
import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { useCalm } from "./ui";
import { useTallViewport } from "./environment";
const panels = [
  {
    id: "pictures",
    title: "The picture you paused on.",
    body: "Photos, screenshots, and the details you want to remember. Keep them together instead of losing them in the camera roll.",
    image: "/media/stories/jellyfish.jpg",
    alt: "An orange jellyfish drifting in deep blue water.",
    caption: "A little otherworldly.",
  },
  {
    id: "thoughts",
    title: "The thought you almost lost.",
    body: "A plan for the weekend. A good sentence. A note to yourself. Your words belong beside the pictures, not in another pile.",
    note: true,
    caption: "A weekend by the water",
  },
  {
    id: "spaces",
    title: "A corner of your own.",
    body: "Put favourites in a regular Space, or let a Smart Space collect items that match a saved search. A little structure, only when you want it.",
    image: "/media/keepers/bear.jpg",
    alt: "A brown bear beside a quiet lake and forested mountains.",
    caption: "Out in nature",
  },
];
function PanelPicture({ panel }) {
  return panel.note ? (
    <div className="scroll-note">
      <span>A note to myself</span>
      <p>
        A weekend
        <br />
        by the water.
      </p>
      <p>Bring a notebook, a camera and a warm layer. Leave room for the unplanned.</p>
    </div>
  ) : (
    <img src={panel.image} alt={panel.alt} width="720" height="960" loading="lazy" />
  );
}
export function ScrollPanels() {
  const root = React.useRef(null),
    calm = useCalm(),
    fits = useTallViewport(),
    [active, setActive] = React.useState(0);
  const { scrollYProgress } = useScroll({ target: root, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (value) =>
    setActive(Math.min(panels.length - 1, Math.floor(Math.max(0, value) * panels.length))),
  );
  const enhanced = fits && !calm;
  return (
    <div ref={root} className="scroll-panels" data-enhanced={enhanced} data-active={active}>
      <div className="scroll-panels-stage frame">
        <div className="vertical-panels" aria-label="A little more about your library">
          {panels.map((panel, index) => (
            <section
              key={panel.id}
              className="vertical-panel"
              data-active={active === index}
              aria-labelledby={`panel-${panel.id}`}
            >
              <h3
                id={`panel-${panel.id}`}
                aria-current={enhanced && active === index ? "step" : undefined}
              >
                {panel.title}
              </h3>
              <div className="vertical-panel-body">
                <div>
                  <p>{panel.body}</p>
                </div>
              </div>
              <figure className="inline-panel-picture">
                <PanelPicture panel={panel} />
                <figcaption>{panel.caption}</figcaption>
              </figure>
            </section>
          ))}
        </div>
        <div className="scroll-panel-pictures" aria-hidden="true">
          {panels.map((panel, index) => (
            <motion.figure
              key={panel.id}
              className={`scroll-panel-picture picture-${panel.id}`}
              initial={false}
              animate={{
                opacity: active === index ? 1 : 0,
                y: active === index ? 0 : 22,
                scale: active === index ? 1 : 1.025,
              }}
              transition={{ duration: calm ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              <PanelPicture panel={panel} />
            </motion.figure>
          ))}
          <p className="scroll-panel-caption">{panels[active].caption}</p>
        </div>
      </div>
    </div>
  );
}
