import Settings01Icon from "@hugeicons/core-free-icons/Settings01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, IconButton, SegmentedControl, TextField } from "@inkling/ui";
import { color, font, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { type FormEvent, type ReactNode, type Ref, useRef, useState } from "react";
import browser from "webextension-polyfill";
import { CardFace } from "../../../apps/renderer/src/cards/CardFace.tsx";
import { toCardView } from "../../../apps/renderer/src/library/cardModel.ts";
import { Mascot } from "../../../apps/renderer/src/mascot/Mascot.tsx";
import { deliver } from "../deliver";
import type { Choice } from "../page";

type Connection = "connected" | "unpaired" | "refused" | "silent";
type Status =
  | { step: "ready" }
  | { step: "saving" }
  | { step: "done"; delivery: "saved" | "sent" }
  | { step: "failed"; message: string };

const ignore = () => {};
// An article card's own height. A taller card, a long quote or a portrait
// image, is zoomed down to it: Chrome stops a popup growing at 600px.
const cardMaxHeight = 262;
function fitCard(element: HTMLDivElement | null) {
  const height = element?.offsetHeight ?? 0;
  if (element && height > cardMaxHeight) element.style.zoom = String(cardMaxHeight / height);
}
const label = (noun: string) => noun.charAt(0).toUpperCase() + noun.slice(1);
const sentence = (message: string) =>
  `${message.startsWith("inkling") ? message : label(message)}.`;

export function Popup({
  choices,
  connection,
}: {
  choices: Choice[] | null;
  connection: Connection;
}) {
  if (!choices?.length) {
    return (
      <Shell heading="Nothing to save here" mood="calm" connection={connection}>
        <p {...stylex.props(styles.note)}>
          inkling saves web pages, images and the text you select on them. Open one and click
          inkling again.
        </p>
      </Shell>
    );
  }
  return <SaveForm choices={choices} connection={connection} />;
}

function SaveForm({ choices, connection }: { choices: Choice[]; connection: Connection }) {
  const [choiceId, setChoiceId] = useState(choices[0].id);
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(choices.map((choice) => [choice.id, choice.field?.value ?? ""])),
  );
  const [status, setStatus] = useState<Status>({ step: "ready" });
  const [flight, setFlight] = useState<{ x: number; y: number } | null>(null);
  const mascotRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const choice = choices.find((candidate) => candidate.id === choiceId) ?? choices[0];
  const value = fields[choice.id] ?? "";
  const { payload, card } = choice.build(value);
  const view = toCardView(card);
  const busy = status.step === "saving" || status.step === "done";

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setStatus({ step: "saving" });
    try {
      const delivery = await deliver(payload);
      const from = cardRef.current?.getBoundingClientRect();
      const to = mascotRef.current?.getBoundingClientRect();
      if (from && to) {
        setFlight({
          x: to.left + to.width / 2 - (from.left + from.width / 2),
          y: to.top + to.height / 2 - (from.top + from.height / 2),
        });
      }
      setStatus({ step: "done", delivery });
      setTimeout(() => window.close(), 1_400);
    } catch (error) {
      setStatus({
        step: "failed",
        message: error instanceof Error ? error.message : "inkling did not answer",
      });
    }
  };

  const heading =
    status.step === "done"
      ? status.delivery === "saved"
        ? "Saved to inkling"
        : "Sent to inkling"
      : status.step === "failed"
        ? `Couldn't save this ${choice.noun}`
        : `Save this ${choice.noun}`;

  return (
    <Shell
      heading={heading}
      mood={status.step === "failed" ? "sad" : status.step === "saving" ? "busy" : "calm"}
      connection={connection}
      mascotRef={mascotRef}
    >
      <div {...stylex.props(styles.stage)}>
        <div
          ref={cardRef}
          inert
          {...stylex.props(styles.card, flight && styles.fly(flight.x, flight.y))}
        >
          {/* A new card or field text can change the card's height; a new element is measured again. */}
          <div key={`${choice.id}:${value}`} ref={fitCard} {...stylex.props(styles.fit)}>
            <CardFace
              view={view}
              index={0}
              list={false}
              processing={undefined}
              onOpen={ignore}
              onRead={ignore}
              onMenu={ignore}
              onRetry={ignore}
            />
          </div>
        </div>
      </div>
      <form onSubmit={save} {...stylex.props(styles.form)}>
        {choices.length > 1 && (
          <SegmentedControl
            name="save-as"
            label="Save as"
            options={choices.map((option) => ({ value: option.id, label: label(option.noun) }))}
            value={choice.id}
            onChange={(id) => {
              setChoiceId(id);
              if (status.step === "failed") setStatus({ step: "ready" });
            }}
            disabled={busy}
            style={styles.choices}
          />
        )}
        {choice.field && (
          <label {...stylex.props(styles.field)}>
            <span {...stylex.props(styles.fieldLabel)}>{choice.field.label}</span>
            <TextField
              value={value}
              disabled={busy}
              style={styles.input}
              placeholder={choice.id === "page" ? "The page's own title" : undefined}
              onChange={(event) =>
                setFields((current) => ({ ...current, [choice.id]: event.target.value }))
              }
            />
          </label>
        )}
        {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- The popup opens to save: Enter saves at once. */}
        <Button type="submit" variant="primary" disabled={busy} autoFocus style={styles.save}>
          {status.step === "saving" ? "Saving…" : status.step === "failed" ? "Try again" : "Save"}
        </Button>
        {status.step === "failed" && (
          <p role="alert" {...stylex.props(styles.note, styles.error)}>
            {sentence(status.message)}
          </p>
        )}
      </form>
    </Shell>
  );
}

function Shell({
  heading,
  mood,
  connection,
  mascotRef,
  children,
}: {
  heading: string;
  mood: "calm" | "busy" | "sad";
  connection: Connection;
  mascotRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <main {...stylex.props(styles.shell)}>
      <header {...stylex.props(styles.header)}>
        <div ref={mascotRef}>
          <Mascot
            mood={{ busy: mood === "busy", face: mood === "sad" ? "sad" : "calm" }}
            size={36}
          />
        </div>
        <h1 aria-live="polite" {...stylex.props(styles.heading)}>
          {heading}
        </h1>
        <IconButton
          label="Extension settings"
          icon={<HugeiconsIcon icon={Settings01Icon} size={15} />}
          onClick={() => void browser.runtime.openOptionsPage()}
        />
      </header>
      {children}
      <ConnectionLine connection={connection} />
    </main>
  );
}

function ConnectionLine({ connection }: { connection: Connection }) {
  if (connection === "connected") {
    return (
      <p {...stylex.props(styles.connection)}>
        <span {...stylex.props(styles.dot)} aria-hidden="true" />
        Connected to inkling
      </p>
    );
  }
  return (
    <p {...stylex.props(styles.connection)}>
      <span {...stylex.props(styles.connectionText)}>
        {connection === "unpaired"
          ? "Saving opens the inkling app."
          : connection === "refused"
            ? "inkling no longer knows this pairing, so saving opens the app."
            : "inkling isn't answering, so saving opens the app."}
      </span>
      <button
        type="button"
        onClick={() => void browser.runtime.openOptionsPage()}
        {...stylex.props(styles.textButton)}
      >
        {connection === "unpaired" ? "Pair" : "Update pairing"}
      </button>
    </p>
  );
}

const styles = stylex.create({
  shell: {
    display: "flex",
    flexDirection: "column",
    gap: space.s3,
    padding: space.s4,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: space.s3,
  },
  heading: {
    flexGrow: 1,
    minWidth: 0,
    margin: 0,
    color: color.inkStrong,
    fontFamily: font.display,
    fontSize: text.xl,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    lineHeight: 1.2,
  },
  stage: {
    display: "flex",
    justifyContent: "center",
    paddingBlock: space.s4,
    paddingInline: space.s4,
    borderRadius: radius.frame,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.sunken,
  },
  card: {
    transformOrigin: "center",
    transitionProperty: "transform, opacity",
    transitionDuration: motion.delight,
    transitionTimingFunction: motion.exit,
  },
  // Near the library grid's own column width, so a title wraps as it will there.
  fit: { width: "272px", marginBottom: "-12px" },
  fly: (x: number, y: number) => ({
    transform: `translate(${x}px, ${y}px) scale(0.08)`,
    opacity: 0,
  }),
  form: {
    display: "flex",
    flexDirection: "column",
    gap: space.s3,
  },
  choices: {
    alignSelf: "stretch",
    backgroundColor: color.sunken,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
  },
  input: { boxSizing: "border-box" },
  fieldLabel: {
    color: color.muted,
    fontSize: text.sm,
  },
  save: {
    height: "36px",
    fontSize: text.lg,
  },
  note: {
    margin: 0,
    color: color.muted,
    fontSize: text.md,
    lineHeight: 1.45,
  },
  error: {
    color: color.danger,
  },
  connection: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    margin: 0,
    paddingTop: space.s3,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.border,
    color: color.muted,
    fontSize: text.sm,
  },
  connectionText: {
    flexGrow: 1,
  },
  dot: {
    width: "6px",
    height: "6px",
    borderRadius: radius.round,
    backgroundColor: color.success,
  },
  textButton: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: { default: color.accentStrong, ":hover": color.inkStrong },
    fontFamily: font.body,
    fontSize: text.sm,
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
});
