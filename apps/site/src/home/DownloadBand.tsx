import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { page } from "../layout/page.ts";
import { action, type } from "../parts/type.ts";

export function DownloadBand() {
  return (
    <section {...stylex.props(page.column, styles.band)}>
      <h2 {...stylex.props(type.heading, styles.title)}>Start keeping things.</h2>
      <p {...stylex.props(type.body)}>Free for Windows, Linux and Apple silicon Macs.</p>
      <Link to="/download" {...stylex.props(action.primary, styles.button)}>
        Download inkling
      </Link>
    </section>
  );
}

const styles = stylex.create({
  band: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "16px" },
  title: { maxWidth: "16ch" },
  button: { marginTop: "12px" },
});
