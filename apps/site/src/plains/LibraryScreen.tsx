import {
  Add01Icon,
  Archive01Icon,
  GridViewIcon,
  ListViewIcon,
  PlusSignIcon,
  Search01Icon,
  Settings01Icon,
  SidebarLeftIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, plainsColor, radius } from "@inkling/ui/tokens.stylex";
import { SpaceMark } from "../../../renderer/src/shell/SpaceMark.tsx";
import { type PlainsItem, lanes, search, spaces, total } from "./items.ts";
import { media } from "./media.ts";

// A still copy of the library view, built from the app's tokens, SpaceMark and the
// note card's layout, so the scroll can type into it without loading the app.
// The dive script finds its moving parts by their data-plains attributes.

function DotGrid() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      {[5, 12, 19].flatMap((cy) =>
        [5, 12, 19].map((cx) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.2" fill="currentColor" />
        )),
      )}
    </svg>
  );
}

function Card({ item, compact }: { item: PlainsItem; compact: boolean }) {
  const lift = item.id === search.match;
  return (
    <div
      data-plains-card={lift ? "match" : search.near.includes(item.id) ? "near" : "other"}
      {...stylex.props(styles.card, item.kind === "photo" ? styles.photoCard : styles.noteCard)}
    >
      {item.kind === "photo" ? (
        <div
          role="img"
          aria-label={item.title}
          {...stylex.props(
            styles.photo,
            styles.sheet(
              compact ? media.smallLibrary : media.library,
              `${(item.cell % 3) * 50}% ${Math.floor(item.cell / 3) * 50}%`,
            ),
          )}
        />
      ) : (
        <div {...stylex.props(styles.note, compact && styles.compactNote)}>
          <img src={media.texture} alt="" decoding="async" {...stylex.props(styles.texture)} />
          <div {...stylex.props(styles.labelRow)}>
            <span {...stylex.props(styles.label)}>NOTE</span>
            <span {...stylex.props(styles.ring)} />
          </div>
          <span {...stylex.props(styles.noteTitle, compact && styles.compactTitle)}>
            {item.title}
          </span>
          <div {...stylex.props(styles.dots)}>
            <span {...stylex.props(styles.dot, styles.dotAccent)} />
            <span {...stylex.props(styles.dot, styles.dotYellow)} />
            <span {...stylex.props(styles.dot, styles.dotGreen)} />
          </div>
          <span {...stylex.props(styles.footnote)}>{item.words} WORDS</span>
        </div>
      )}
      {lift && <span data-plains-ring {...stylex.props(styles.ring2)} />}
    </div>
  );
}

function SearchPill({ compact }: { compact: boolean }) {
  return (
    <div {...stylex.props(styles.search, compact && styles.compactSearch)}>
      <HugeiconsIcon icon={Search01Icon} size={compact ? 14 : 15} {...stylex.props(styles.muted)} />
      <span {...stylex.props(styles.field)}>
        <span data-plains-placeholder {...stylex.props(styles.placeholder)}>
          {search.placeholder}
        </span>
        <span data-plains-query {...stylex.props(styles.query)} />
        <span data-plains-caret {...stylex.props(styles.caret)} />
      </span>
    </div>
  );
}

export function LibraryScreen({ layout }: { layout: "desktop" | "phone" }) {
  const phone = layout === "phone";
  return (
    <div
      aria-hidden
      {...stylex.props(styles.window, phone ? styles.phoneWindow : styles.deskWindow)}
    >
      {phone ? (
        <div {...stylex.props(styles.phoneTop)}>
          <img src={media.mark} alt="" {...stylex.props(styles.appMark)} />
          <span {...stylex.props(styles.wordmark)}>inkling</span>
          <span {...stylex.props(styles.phoneAdd)}>
            <HugeiconsIcon icon={Add01Icon} size={16} />
          </span>
        </div>
      ) : (
        <aside {...stylex.props(styles.sidebar)}>
          <div {...stylex.props(styles.brand)}>
            <img src={media.mark} alt="" {...stylex.props(styles.appMark)} />
            <span {...stylex.props(styles.wordmark)}>inkling</span>
            <HugeiconsIcon icon={SidebarLeftIcon} size={16} {...stylex.props(styles.toggle)} />
          </div>
          <div {...stylex.props(styles.row, styles.active)}>
            <span {...stylex.props(styles.rowIcon, styles.accent)}>
              <DotGrid />
            </span>
            Everything
            <span {...stylex.props(styles.count)}>{total}</span>
          </div>
          <div {...stylex.props(styles.section)}>
            Spaces
            <HugeiconsIcon icon={PlusSignIcon} size={14} />
          </div>
          {spaces.map((space) => (
            <div key={space.name} {...stylex.props(styles.row, styles.spaceRow)}>
              <span {...stylex.props(styles.rowIcon)}>
                <SpaceMark color={space.color} />
              </span>
              {space.name}
              {space.count > 0 && <span {...stylex.props(styles.count)}>{space.count}</span>}
            </div>
          ))}
          <div {...stylex.props(styles.grow)} />
          <div {...stylex.props(styles.add)}>
            <HugeiconsIcon icon={Add01Icon} size={16} />
            Add
          </div>
          <div {...stylex.props(styles.row, styles.footRow)}>
            <span {...stylex.props(styles.rowIcon)}>
              <HugeiconsIcon icon={Archive01Icon} size={15} />
            </span>
            Archive
          </div>
          <div {...stylex.props(styles.row, styles.footRow)}>
            <span {...stylex.props(styles.rowIcon)}>
              <HugeiconsIcon icon={Settings01Icon} size={15} />
            </span>
            Settings
          </div>
        </aside>
      )}
      <main {...stylex.props(styles.panel, phone && styles.phonePanel)}>
        <div {...stylex.props(styles.grid, phone && styles.phoneGrid)}>
          {lanes[layout].map((lane) => (
            <div key={lane[0]!.id} {...stylex.props(styles.lane, phone && styles.phoneLane)}>
              {lane.map((item) => (
                <Card key={item.id} item={item} compact={phone} />
              ))}
            </div>
          ))}
        </div>
        <div {...stylex.props(styles.searchSlot, phone && styles.phoneSearchSlot)}>
          <SearchPill compact={phone} />
        </div>
        {!phone && (
          <div {...stylex.props(styles.dock)}>
            <span {...stylex.props(styles.dockOn)}>
              <HugeiconsIcon icon={GridViewIcon} size={15} />
            </span>
            <HugeiconsIcon icon={ListViewIcon} size={15} />
          </div>
        )}
      </main>
    </div>
  );
}

const blink = stylex.keyframes({ "0%, 49%": { opacity: 1 }, "50%, 100%": { opacity: 0 } });

const styles = stylex.create({
  window: {
    position: "relative",
    boxSizing: "border-box",
    display: "flex",
    overflow: "hidden",
    backgroundColor: color.window,
    color: color.ink,
    fontFamily: font.body,
    fontSize: "13px",
    lineHeight: 1.3,
    userSelect: "none",
  },
  deskWindow: { width: "1280px", height: "832px", paddingBlock: "8px", paddingRight: "8px" },
  phoneWindow: { width: "100%", height: "100%", flexDirection: "column" },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    width: "232px",
    flexShrink: 0,
    paddingTop: "30px",
    paddingInline: "8px",
    boxSizing: "border-box",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    paddingLeft: "12px",
    paddingRight: "10px",
    marginBottom: "16px",
  },
  appMark: { width: "28px", height: "28px", filter: "invert(0.9)" },
  wordmark: {
    fontFamily: font.quote,
    fontSize: "20px",
    lineHeight: 1,
    letterSpacing: "-0.04em",
    marginLeft: "-4px",
    color: color.ink,
  },
  toggle: { marginLeft: "auto", color: color.muted },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    height: "34px",
    paddingInline: "18px",
    borderRadius: radius.control,
    fontSize: "14px",
    color: color.inkSoft,
  },
  active: { fontWeight: 600, color: color.inkStrong },
  spaceRow: { paddingInline: "10px" },
  footRow: { fontSize: "13px", color: color.muted, height: "32px" },
  rowIcon: { display: "grid", placeItems: "center", width: "16px", color: color.muted },
  accent: { color: color.accent },
  count: { marginLeft: "auto", fontSize: "12px", fontWeight: 400, color: color.muted },
  section: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "18px",
    marginBottom: "4px",
    paddingInline: "10px 14px",
    fontSize: "12px",
    color: color.muted,
  },
  grow: { flexGrow: 1 },
  add: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    height: "40px",
    marginBottom: "10px",
    borderRadius: radius.control,
    backgroundColor: color.ink,
    color: color.window,
    fontSize: "15px",
    fontWeight: 600,
    boxShadow: `inset 0 1px 0 ${cardColor.addHighlight}`,
  },
  panel: {
    position: "relative",
    flexGrow: 1,
    overflow: "hidden",
    borderRadius: radius.frame,
    backgroundColor: color.frame,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
  },
  phonePanel: { borderRadius: 0, borderWidth: 0, backgroundColor: color.window },
  grid: {
    display: "flex",
    gap: "12px",
    paddingTop: "12px",
    paddingInline: "12px",
  },
  phoneGrid: { gap: "8px", paddingTop: "62px", paddingInline: "8px" },
  lane: { display: "flex", flexDirection: "column", gap: "12px", flexBasis: 0, flexGrow: 1 },
  phoneLane: { gap: "8px" },
  card: {
    position: "relative",
    borderRadius: radius.card,
    backgroundColor: color.surface,
    transformOrigin: "50% 50%",
  },
  photoCard: { aspectRatio: "3 / 4" },
  noteCard: { aspectRatio: "327 / 300" },
  photo: {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    backgroundSize: "300% 300%",
    backgroundRepeat: "no-repeat",
  },
  sheet: (image: string, position: string) => ({
    backgroundImage: image,
    backgroundPosition: position,
  }),
  ring2: {
    position: "absolute",
    inset: "-3px",
    borderRadius: "23px",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: plainsColor.matchRing,
    boxShadow: `0 18px 40px ${plainsColor.appShadow}`,
    opacity: 0,
    pointerEvents: "none",
  },
  note: {
    position: "absolute",
    inset: 0,
    isolation: "isolate",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: "inherit",
    backgroundColor: color.window,
    paddingTop: "42px",
    paddingInline: "28px",
    paddingBottom: "30px",
    boxSizing: "border-box",
  },
  compactNote: { paddingTop: "18px", paddingInline: "14px", paddingBottom: "14px" },
  texture: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  labelRow: {
    position: "relative",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontFamily: font.mono,
    fontSize: "10px",
    lineHeight: "12px",
    letterSpacing: "0.15em",
    color: color.muted,
  },
  ring: {
    width: "22px",
    height: "22px",
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.muted,
    opacity: 0.85,
  },
  noteTitle: {
    position: "relative",
    zIndex: 2,
    marginTop: "36px",
    paddingRight: "12px",
    fontFamily: font.display,
    fontSize: "21px",
    lineHeight: "116%",
    fontWeight: 600,
    letterSpacing: "-0.025em",
    textTransform: "uppercase",
    color: color.ink,
  },
  compactTitle: { marginTop: "14px", fontSize: "14px" },
  dots: { position: "relative", zIndex: 2, display: "flex", gap: "8px", marginTop: "14px" },
  dot: { width: "10px", height: "10px", borderRadius: radius.round },
  dotAccent: { backgroundColor: color.accent },
  dotYellow: { backgroundColor: color.paperYellow },
  dotGreen: { backgroundColor: color.success },
  footnote: {
    position: "relative",
    zIndex: 2,
    marginTop: "auto",
    alignSelf: "flex-end",
    fontFamily: font.mono,
    fontSize: "10px",
    letterSpacing: "0.08em",
    color: color.muted,
  },
  searchSlot: {
    position: "absolute",
    top: "14px",
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    pointerEvents: "none",
  },
  phoneSearchSlot: { top: "10px", paddingInline: "10px" },
  search: {
    display: "flex",
    alignItems: "center",
    gap: "9px",
    width: "400px",
    height: "38px",
    paddingInline: "14px",
    boxSizing: "border-box",
    borderRadius: radius.round,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.glassEdge,
    boxShadow: `0 10px 30px ${color.shadow}`,
  },
  compactSearch: { width: "100%", height: "40px" },
  muted: { color: color.muted, flexShrink: 0 },
  field: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    flexGrow: 1,
    minWidth: 0,
    fontSize: "14px",
    whiteSpace: "nowrap",
  },
  placeholder: {
    position: "absolute",
    left: 0,
    right: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: color.muted,
  },
  query: { color: color.inkStrong, fontWeight: 500 },
  caret: {
    width: "1.5px",
    height: "16px",
    marginLeft: "1px",
    backgroundColor: color.accentStrong,
    visibility: "hidden",
    animationName: blink,
    animationDuration: "1s",
    animationIterationCount: "infinite",
  },
  dock: {
    position: "absolute",
    bottom: "16px",
    left: "50%",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px",
    transform: "translateX(-50%)",
    borderRadius: radius.round,
    backgroundColor: color.glass,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.glassEdge,
    color: color.muted,
  },
  dockOn: {
    display: "grid",
    placeItems: "center",
    width: "26px",
    height: "26px",
    borderRadius: radius.round,
    backgroundColor: color.overlayActive,
    color: color.ink,
  },
  phoneTop: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    height: "44px",
    paddingInline: "16px",
    flexShrink: 0,
  },
  phoneAdd: {
    display: "grid",
    placeItems: "center",
    width: "28px",
    height: "28px",
    marginLeft: "auto",
    borderRadius: radius.round,
    backgroundColor: color.ink,
    color: color.window,
  },
});
