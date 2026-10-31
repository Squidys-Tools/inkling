import * as stylex from "@stylexjs/stylex";
import { color, layout, radius } from "@inkling/ui/tokens.stylex";
import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar.tsx";
import { TitleBar } from "./TitleBar.tsx";
import { useCommands } from "./useCommands.ts";

export function AppShell() {
  useCommands();
  return (
    <div {...stylex.props(styles.shell)}>
      <TitleBar />
      <Sidebar />
      <main {...stylex.props(styles.stage)}>
        <Outlet />
      </main>
    </div>
  );
}

const styles = stylex.create({
  shell: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: `${layout.sidebar} minmax(0, 1fr)`,
    height: "100%",
    paddingTop: layout.titlebar,
    backgroundColor: color.window,
    color: color.ink,
  },
  stage: {
    position: "relative",
    minWidth: 0,
    minHeight: 0,
    marginRight: "8px",
    marginBottom: "8px",
    borderRadius: radius.frame,
    backgroundColor: color.frame,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    overflow: "hidden",
    // The stage paints on its own layer, so the sidebar sliding over it never repaints the grid.
    contain: "strict",
  },
});
