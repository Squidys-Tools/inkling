import type { LibraryCard } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { Button, Kbd } from "@inkling/ui";
import {
  color,
  font,
  itemColor,
  layout,
  motion,
  radius,
  space,
  text,
} from "@inkling/ui/tokens.stylex";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { controlsOnRight } from "../desktop.ts";
import { reportActionError } from "../cards/actionError.ts";
import { confirmDeleteForever, setArchived } from "../cards/cardActions.ts";
import { notify } from "../notifications/toasts.ts";
import { type LibraryClient, libraryClient } from "../library/connection.ts";
import { errorMessage } from "../library/errors.ts";
import { refreshJobs } from "../library/jobs.ts";
import { setInSpace, useSpaces } from "../library/spaces.ts";
import { showWrittenCard } from "../library/writes.ts";
import { ActionBar } from "./ActionBar.tsx";
import { InfoPanel, ItemHeading, Palette, paletteOf } from "./InfoPanel.tsx";
import { findCard } from "./itemFlight.ts";
import { describeItem } from "./model.ts";
import { useItemNavigation } from "./navigation.ts";
import { useItem, useMemberships } from "./queries.ts";
import { SimilarPanel } from "./SimilarPanel.tsx";
import { preloadPdfViewer, Stage } from "./Stage.tsx";
import { useEscape } from "./useEscape.ts";
import { useOpenMotion } from "./useOpenMotion.ts";
import { useOcrOnOpen } from "./useOcrOnOpen.ts";

/** An open item: its media on the dotted stage and the inspector beside it, over the library. */
export function ItemView({ id }: { id: string }) {
  const viewRef = useRef<HTMLDivElement>(null);
  const navigation = useItemNavigation();
  useOpenMotion(id, viewRef);

  // Closing hands focus back to the card, unless the user already moved it elsewhere.
  const shownId = useRef(id);
  useEffect(() => {
    shownId.current = id;
  }, [id]);
  useEffect(
    () => () => {
      if (document.activeElement === document.body || !document.activeElement)
        findCard(shownId.current)?.focus({ preventScroll: true });
    },
    [],
  );

  return (
    <div ref={viewRef} data-escape-scope {...stylex.props(styles.view)}>
      <ItemBody
        key={id}
        id={id}
        onClose={navigation.close}
        onOpenSimilar={navigation.openSimilar}
      />
    </div>
  );
}

function ItemBody({
  id,
  onClose,
  onOpenSimilar,
}: {
  id: string;
  onClose: () => void;
  onOpenSimilar: (id: string) => void;
}) {
  const navigate = useNavigate();
  const query = useItem(id);
  const memberships = useMemberships(id);
  const regularSpaces = useSpaces().filter((space) => space.kind === "regular");
  const [section, setSection] = useState<Section>("info");
  // Similar items load once the user heads for them, not on every open.
  const [similarWanted, setSimilarWanted] = useState(false);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [similar, setSimilar] = useState<HTMLElement | null>(null);
  const pinned = useRef<HTMLDivElement>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const detail = query.data;
  const item = detail ? describeItem(detail) : null;

  useEscape(() => (pdfOpen ? setPdfOpen(false) : onClose()));
  useOcrOnOpen(detail);
  useEffect(() => {
    void refreshJobs([id]);
    closeButton.current?.focus({ preventScroll: true });
  }, [id]);
  useEffect(() => {
    if (item?.kind === "PDF") preloadPdfViewer();
  }, [item?.kind]);

  // An item deleted while open (here or from anywhere else) closes its view.
  const closeOnRemoval = useEffectEvent(onClose);
  const seen = useRef(false);
  useEffect(() => {
    if (detail) seen.current = true;
    else if (detail === null && seen.current) closeOnRemoval();
  }, [detail]);

  /** Runs a write and reports whether it worked; the library's change event redraws the item. */
  const act = (action: (client: LibraryClient) => Promise<unknown>) =>
    libraryClient()
      .then(action)
      .then(
        () => {
          setActionError(null);
          return true;
        },
        (error: unknown) => {
          setActionError(errorMessage(error));
          reportActionError(errorMessage(error));
          return false;
        },
      );

  /** A write that answers with the item's card, shown at once. */
  const write = (action: (client: LibraryClient) => Promise<LibraryCard>) =>
    act(async (client) => showWrittenCard(await action(client)));

  // Not the card menu's deleteForever: a failure here also shows in the Info panel.
  const deleteForever = async (title: string) => {
    if ((await confirmDeleteForever(title)) && (await act((client) => client.deleteItem({ id }))))
      notify("Deleted permanently");
  };

  useEffect(() => {
    if (!scroller || !similar) return;
    // The section starts flush with the fold, which an observer counts as touching.
    const approached = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSimilarWanted(true);
      },
      { root: scroller, rootMargin: "0px 0px -8px 0px" },
    );
    const reached = new IntersectionObserver(
      (entries) => setSection(entries.some((entry) => entry.isIntersecting) ? "similar" : "info"),
      { root: scroller, rootMargin: "0px 0px -50% 0px" },
    );
    approached.observe(similar);
    reached.observe(similar);
    return () => {
      approached.disconnect();
      reached.disconnect();
    };
  }, [scroller, similar]);

  const goTo = (target: Section) => {
    if (target === "similar") setSimilarWanted(true);
    const below = (similar?.offsetTop ?? 0) - (pinned.current?.offsetHeight ?? 0);
    scroller?.scrollTo({ top: target === "info" ? 0 : below });
  };

  const swatches = item ? paletteOf(item) : [];
  const memberOf = memberships.data ?? [];
  const status =
    (query.isLoadingError && errorMessage(query.error)) ??
    (detail === null ? "This item is no longer in your library." : null);

  return (
    <div {...stylex.props(styles.layout)}>
      <div {...stylex.props(styles.stage, pdfOpen && styles.stageDocument)}>
        {item && <Stage item={item} pdfOpen={pdfOpen} onClosePdf={() => setPdfOpen(false)} />}
      </div>
      <div {...stylex.props(styles.inspector, controlsOnRight && styles.belowControls)}>
        <header {...stylex.props(styles.header)}>
          {item && (
            <nav aria-label="Item sections" {...stylex.props(styles.tabs)}>
              {sections.map(({ id: target, label }) => (
                <button
                  key={target}
                  type="button"
                  aria-current={section === target ? "true" : undefined}
                  onClick={() => goTo(target)}
                  {...stylex.props(styles.tab, section === target && styles.tabActive)}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
          <Button
            ref={closeButton}
            aria-label="Close"
            data-bench="item-close"
            style={styles.close}
            onClick={onClose}
          >
            Close <Kbd>esc</Kbd>
          </Button>
        </header>
        {status && (
          <p role="alert" {...stylex.props(styles.status)}>
            {status}
          </p>
        )}
        {item && (
          <>
            <div ref={setScroller} tabIndex={-1} {...stylex.props(styles.scroller)}>
              <div {...stylex.props(styles.page)}>
                <div aria-hidden="true" {...stylex.props(styles.firstScreen)} />
                <div {...stylex.props(styles.heading)}>
                  <ItemHeading
                    item={item}
                    onRename={(title) => void write((client) => client.updateItem({ id, title }))}
                  />
                </div>
                {swatches.length > 0 && (
                  <div ref={pinned} {...stylex.props(styles.pinned)}>
                    <Palette swatches={swatches} />
                  </div>
                )}
                <div {...stylex.props(styles.info, swatches.length > 0 && styles.underPalette)}>
                  <InfoPanel
                    item={item}
                    filedIn={regularSpaces.filter((space) => memberOf.includes(space.id))}
                    onAddTag={(addTag) => void write((client) => client.updateItem({ id, addTag }))}
                    onRemoveTag={(removeTag) =>
                      void write((client) => client.updateItem({ id, removeTag }))
                    }
                    onEditNote={() => void navigate({ to: "/item/$id/write", params: { id } })}
                    onOpenPdf={() => setPdfOpen(true)}
                    onRead={() => void navigate({ to: "/item/$id/read", params: { id } })}
                  />
                  {actionError && <p {...stylex.props(styles.error)}>{actionError}</p>}
                </div>
                <section
                  ref={setSimilar}
                  aria-label="Similar"
                  {...stylex.props(styles.similar, swatches.length > 0 && styles.similarPinned)}
                >
                  {similarWanted && <SimilarPanel item={item} onOpen={onOpenSimilar} />}
                </section>
              </div>
            </div>
            <ActionBar
              item={item}
              spaces={regularSpaces}
              memberOf={memberOf}
              onToggleSpace={(spaceId, filed) => void setInSpace(spaceId, id, filed)}
              onArchive={() => void setArchived(id, true).then((archived) => archived && onClose())}
              onRestore={() => void setArchived(id, false)}
              onDelete={() => void deleteForever(item.title)}
            />
          </>
        )}
      </div>
    </div>
  );
}

type Section = "info" | "similar";
const sections: readonly { id: Section; label: string }[] = [
  { id: "info", label: "Info" },
  { id: "similar", label: "Similar" },
];

const narrow = "@media (max-width: 780px)";

const styles = stylex.create({
  view: { position: "absolute", inset: 0, zIndex: 10, backgroundColor: color.frame },
  layout: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 1fr) 320px", [narrow]: "minmax(0, 1fr)" },
    gridTemplateRows: { default: "minmax(0, 1fr)", [narrow]: "minmax(0, 1fr) minmax(0, 1fr)" },
    height: "100%",
  },
  stage: {
    position: "relative",
    display: "grid",
    placeItems: "center",
    minWidth: 0,
    minHeight: 0,
    margin: space.s2,
    paddingBlock: { default: "60px", [narrow]: space.s4 },
    paddingInline: { default: space.s10, [narrow]: space.s4 },
    overflow: "hidden",
    borderRadius: `calc(${radius.frame} - 1px)`,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: itemColor.stage,
    backgroundImage: `radial-gradient(circle, ${itemColor.stageDot} 1px, transparent 1.2px)`,
    backgroundSize: "18px 18px",
  },
  stageDocument: { padding: 0, placeItems: "stretch" },
  inspector: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    paddingTop: "6px",
    paddingRight: space.s4,
    paddingBottom: space.s2,
    paddingLeft: "18px",
    fontFamily: font.body,
  },
  // The Close button sits just under the window's own buttons.
  belowControls: { paddingTop: { default: `calc(3px + ${layout.titlebar})`, [narrow]: "6px" } },
  header: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "space-between",
    // At phone width Close wraps to its own line instead of running into Similar.
    height: { default: "40px", "@media (max-width: 360px)": "auto" },
    minHeight: "40px",
    flexWrap: { default: "nowrap", "@media (max-width: 360px)": "wrap" },
    gap: { default: 0, "@media (max-width: 360px)": "8px 12px" },
  },
  tabs: { display: "flex", alignItems: "center", gap: "18px" },
  tab: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontFamily: font.body,
    fontSize: "14px",
    lineHeight: "18px",
    color: { default: color.muted, ":hover": color.inkSoft },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "4px",
    borderRadius: "2px",
    transitionProperty: "color",
    transitionDuration: motion.reveal,
    transitionTimingFunction: motion.standard,
  },
  tabActive: { fontWeight: 600, color: { default: color.ink, ":hover": color.ink } },
  close: {
    marginLeft: "auto",
    height: "28px",
    paddingInline: space.s2,
    gap: "6px",
    fontSize: text.sm,
    color: { default: color.muted, ":hover": color.ink },
  },
  // One page: Info fills the first screen and Similar follows it.
  scroller: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
    scrollbarWidth: "none",
    scrollBehavior: { default: "smooth", "@media (prefers-reduced-motion: reduce)": "auto" },
    containerType: "size",
    outline: "none",
  },
  page: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "auto 1fr auto",
    paddingTop: space.s5,
  },
  // Holds the heading and Info rows to one screen, so Similar starts below the fold.
  firstScreen: {
    gridColumn: 1,
    gridRow: "1 / 3",
    height: `calc(100cqh - ${space.s5})`,
    visibility: "hidden",
    pointerEvents: "none",
  },
  heading: { gridColumn: 1, gridRow: 1, minWidth: 0 },
  // A grid item sticks only within its own area, so the palette's spans Info and Similar.
  pinned: {
    gridColumn: 1,
    gridRow: "2 / 4",
    alignSelf: "start",
    position: "sticky",
    top: 0,
    zIndex: 1,
    paddingBlock: space.s3,
    backgroundColor: color.frame,
    "::after": {
      content: '""',
      position: "absolute",
      insetInline: 0,
      top: "100%",
      height: space.s3,
      backgroundImage: `linear-gradient(${color.frame}, transparent)`,
      pointerEvents: "none",
    },
  },
  info: {
    gridColumn: 1,
    gridRow: 2,
    display: "flex",
    flexDirection: "column",
    gap: space.s5,
    minWidth: 0,
    paddingTop: space.s5,
    paddingBottom: space.s5,
  },
  // The pinned band is a swatch (22px) with s3 above and below it.
  underPalette: { paddingTop: `calc(${space.s3} + 22px + ${space.s5})` },
  // Tall enough that Similar can scroll all the way up to the top.
  similar: {
    gridColumn: 1,
    gridRow: 3,
    minWidth: 0,
    minHeight: "100cqh",
    paddingTop: space.s5,
    paddingBottom: space.s5,
  },
  similarPinned: { minHeight: `calc(100cqh - 22px - 2 * ${space.s3})`, paddingTop: space.s2 },
  status: {
    margin: 0,
    paddingTop: space.s5,
    fontSize: text.md,
    lineHeight: "20px",
    color: color.muted,
  },
  error: { margin: 0, fontSize: text.sm, lineHeight: 1.45, color: color.danger },
});
