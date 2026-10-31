import * as stylex from "@stylexjs/stylex";
import { Button, Glass, IconButton, Kbd, TextArea, TextField } from "@inkling/ui";
import { color, font, radius, space, spaceColor, text } from "@inkling/ui/tokens.stylex";
import { Page } from "./Page.tsx";

// Preview-only reference sheet: every color role and primitive, for visual checks.
export function DesignPage() {
  return (
    <Page title="Design tokens">
      <Swatches name="Color roles" values={color} />
      <Swatches name="Space colors" values={spaceColor} />
      <div {...stylex.props(styles.row)}>
        <Button variant="primary">Save note</Button>
        <Button>Cancel</Button>
        <Button variant="outline">Export library</Button>
        <Button variant="danger">Delete forever</Button>
        <IconButton label="Search" icon="⌕" />
        <Kbd>⌘K</Kbd>
      </div>
      <Glass style={styles.glass}>
        <TextField placeholder="Search your library" />
      </Glass>
      <TextArea placeholder="Write a note" />
      <p {...stylex.props(styles.quote)}>“Quotes and note headings use the bundled serif.”</p>
    </Page>
  );
}

// A VarGroup maps each role to its CSS variable reference.
function Swatches({ name, values }: { name: string; values: object }) {
  return (
    <div>
      <h2 {...stylex.props(styles.heading)}>{name}</h2>
      <div {...stylex.props(styles.grid)}>
        {Object.entries(values)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string")
          .filter(([role]) => !role.startsWith("__"))
          .map(([role, value]) => (
            <div key={role} {...stylex.props(styles.swatch)}>
              <div {...stylex.props(styles.chip(value))} />
              <span>{role}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

const styles = stylex.create({
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.s3 },
  heading: {
    fontFamily: font.display,
    fontSize: text.lg,
    color: color.inkSoft,
    marginBlock: space.s2,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: space.s3,
  },
  swatch: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: text.xs,
    color: color.muted,
  },
  chip: (value: string) => ({
    height: "48px",
    borderRadius: radius.tile,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: value,
  }),
  glass: { padding: space.s3, maxWidth: "420px" },
  quote: { fontFamily: font.quote, fontSize: text.lg, color: color.ink },
});
