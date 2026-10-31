import {
  type Binding,
  bindingLabel,
  bindingsFor,
  type Command,
} from "@inkling/contracts/shortcuts";
import { Kbd } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { color } from "@inkling/ui/tokens.stylex";
import { page } from "../layout/page.ts";
import { usePlatform } from "../parts/platform.ts";
import { type } from "../parts/type.ts";

type Way = { what: string; command?: Command; binding?: Binding };

const ways: Way[] = [
  { what: "Paste a link, an image or some text", binding: { key: "v", mod: true } },
  { what: "Drop files onto the window" },
  { what: "Save a link", command: "addLink" },
  { what: "Add files", command: "addFile" },
  { what: "Write a note", command: "addNote" },
  { what: "Save a quote with where it came from", command: "addQuote" },
  { what: "Send the page you're reading from Chrome" },
];

function Keys({ way }: { way: Way }) {
  const platform = usePlatform();
  if (!platform) return null;
  const binding = way.binding ?? (way.command && bindingsFor(way.command, platform)[0]);
  return binding ? <Kbd>{bindingLabel(binding, platform)}</Kbd> : null;
}

export function Capture() {
  return (
    <section {...stylex.props(page.column, styles.section)}>
      <div {...stylex.props(styles.copy)}>
        <h2 {...stylex.props(type.heading)}>Saving takes a second.</h2>
        <p {...stylex.props(type.body)}>
          The card shows up the moment you save. inkling reads the article, the PDF or the words in
          the picture afterwards, in the background, while you get on with what you were doing.
        </p>
      </div>
      <ul {...stylex.props(styles.ways)}>
        {ways.map((way) => (
          <li key={way.what} {...stylex.props(styles.way)}>
            <span>{way.what}</span>
            <Keys way={way} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const styles = stylex.create({
  section: {
    display: "grid",
    gridTemplateColumns: { default: "1fr 1fr", "@media (max-width: 860px)": "1fr" },
    gap: "48px",
    alignItems: "start",
  },
  copy: { display: "flex", flexDirection: "column", gap: "20px" },
  ways: { margin: 0, padding: 0, listStyle: "none" },
  way: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    minHeight: "52px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: color.border,
    color: color.ink,
    fontSize: "17px",
  },
});
