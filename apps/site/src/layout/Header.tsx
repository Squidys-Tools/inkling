import * as stylex from "@stylexjs/stylex";
import { color, font, radius } from "@inkling/ui/tokens.stylex";
import { Link, useRouterState } from "@tanstack/react-router";
import { Mascot } from "../../../renderer/src/mascot/Mascot.tsx";
import { repository } from "./links.ts";
import { page } from "./page.ts";

const calm = { busy: false, face: "calm" } as const;

export function Header() {
  return (
    <header {...stylex.props(page.column, styles.header)}>
      <Link to="/" aria-label="inkling home" {...stylex.props(styles.brand)}>
        <Mascot mood={calm} size={34} />
        <span {...stylex.props(styles.wordmark)}>inkling</span>
      </Link>
      <nav aria-label="Site" {...stylex.props(styles.nav)}>
        <NavLink to="/features">Features</NavLink>
        <NavLink to="/privacy">Privacy</NavLink>
        <a href={repository} {...stylex.props(styles.link, styles.optional)}>
          Source
        </a>
        <Link to="/download" {...stylex.props(styles.download)}>
          Download
        </Link>
      </nav>
    </header>
  );
}

function NavLink({ to, children }: { to: "/features" | "/privacy"; children: string }) {
  const here = useRouterState({ select: (state) => state.location.pathname === to });
  return (
    <Link to={to} {...stylex.props(styles.link, here && styles.here)}>
      {children}
    </Link>
  );
}

const styles = stylex.create({
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    height: "76px",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: color.inkStrong,
    textDecoration: "none",
    borderRadius: radius.control,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "4px",
  },
  wordmark: {
    fontFamily: font.display,
    fontSize: "21px",
    fontWeight: 600,
    letterSpacing: "-0.02em",
  },
  nav: { display: "flex", alignItems: "center", gap: "4px" },
  link: {
    paddingBlock: "8px",
    paddingInline: "12px",
    borderRadius: radius.round,
    color: { default: color.muted, ":hover": color.inkStrong },
    fontSize: "15px",
    textDecoration: "none",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  here: { color: color.inkStrong },
  optional: { display: { default: "inline", "@media (max-width: 560px)": "none" } },
  download: {
    marginLeft: "8px",
    paddingBlock: "8px",
    paddingInline: "16px",
    borderRadius: radius.round,
    backgroundColor: { default: color.ink, ":hover": color.inkStrong },
    color: color.app,
    fontSize: "15px",
    fontWeight: 600,
    textDecoration: "none",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "3px",
  },
});
