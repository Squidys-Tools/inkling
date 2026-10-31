import { Tabs } from "@base-ui/react/tabs";
import type { LibraryCard } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { Button, Kbd } from "@inkling/ui";
import { color, font, itemColor, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { desktop } from "../desktop.ts";
import { type LibraryClient, libraryClient } from "../library/connection.ts";
import { errorMessage } from "../library/errors.ts";
import { refreshJobs } from "../library/jobs.ts";
import { selectCard } from "../library/selection.ts";
import { setInSpace, useSpaces } from "../library/spaces.ts";
import { showWrittenCard } from "../library/writes.ts";
import { ActionBar } from "./ActionBar.tsx";
import { InfoPanel } from "./InfoPanel.tsx";
import { describeItem } from "./model.ts";
import { useItemNavigation } from "./navigation.ts";
import { useItem, useMemberships } from "./queries.ts";
import { SimilarPanel } from "./SimilarPanel.tsx";
import { preloadPdfViewer, Stage } from "./Stage.tsx";
import { useEscape } from "./useEscape.ts";
import { findCard, useOpenMotion } from "./useOpenMotion.ts";
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
    selectCard(id);
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
  const [tab, setTab] = useState<"info" | "similar">("info");
  const [pdfOpen, setPdfOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const detail = query.value;
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
          return false;
        },
      );

  /** A write that answers with the item's card, shown at once. */
  const write = (action: (client: LibraryClient) => Promise<LibraryCard>) =>
    act(async (client) => showWrittenCard(await action(client)));

  // The same question the card menu asks; a failure is shown here rather than as a capture error.
  const deleteForever = async (title: string) => {
    const options = {
      message: `Delete “${title}” for good?`,
      detail: "It leaves every Space, and its files are removed from the library.",
      confirmLabel: "Delete",
      destructive: true,
    };
    const confirmed = desktop
      ? await desktop.confirm(options)
      : window.confirm(`${options.message}\n\n${options.detail}`);
    if (confirmed) await act((client) => client.deleteItem({ id }));
  };

  const memberOf = memberships.value ?? [];
  const status =
    query.error ?? (detail === null ? "This item is no longer in your library." : null);

  return (
    <div {...stylex.props(styles.layout)}>
      <div {...stylex.props(styles.stage, pdfOpen && styles.stageDocument)}>
        {item && <Stage item={item} pdfOpen={pdfOpen} onClosePdf={() => setPdfOpen(false)} />}
      </div>
      <Tabs.Root
        value={tab}
        onValueChange={(value) => setTab(value === "similar" ? "similar" : "info")}
        {...stylex.props(styles.inspector)}
      >
        <header {...stylex.props(styles.header)}>
          {item && (
            <Tabs.List activateOnFocus {...stylex.props(styles.tabs)}>
              <Tabs.Tab value="info" className={tabClass}>
                Info
              </Tabs.Tab>
              <Tabs.Tab value="similar" className={tabClass}>
                Similar
              </Tabs.Tab>
            </Tabs.List>
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
            <Tabs.Panel value="info" tabIndex={-1} {...stylex.props(styles.panel)}>
              <InfoPanel
                item={item}
                filedIn={regularSpaces.filter((space) => memberOf.includes(space.id))}
                onRename={(title) => void write((client) => client.updateItem({ id, title }))}
                onAddTag={(addTag) => void write((client) => client.updateItem({ id, addTag }))}
                onEditNote={() => void navigate({ to: "/item/$id/write", params: { id } })}
                onOpenPdf={() => setPdfOpen(true)}
                onRead={() => void navigate({ to: "/item/$id/read", params: { id } })}
              />
              {actionError && (
                <p role="alert" {...stylex.props(styles.error)}>
                  {actionError}
                </p>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="similar" tabIndex={-1} {...stylex.props(styles.panel)}>
              <h2 {...stylex.props(styles.compactTitle)}>{item.title}</h2>
              <SimilarPanel item={item} onOpen={onOpenSimilar} />
            </Tabs.Panel>
            <ActionBar
              item={item}
              spaces={regularSpaces}
              memberOf={memberOf}
              onToggleSpace={(spaceId, filed) => void setInSpace(spaceId, id, filed)}
              onArchive={() =>
                void write((client) => client.setArchived({ id, archived: true })).then(
                  (archived) => archived && onClose(),
                )
              }
              onRestore={() => void write((client) => client.setArchived({ id, archived: false }))}
              onDelete={() => void deleteForever(item.title)}
            />
          </>
        )}
      </Tabs.Root>
    </div>
  );
}

const tabClass = (state: { active: boolean }) =>
  stylex.props(styles.tab, state.active && styles.tabActive).className ?? "";

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
  header: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "space-between",
    height: "40px",
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
  panel: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    gap: space.s5,
    minHeight: 0,
    overflowY: "auto",
    paddingTop: space.s5,
    scrollbarWidth: "none",
    outline: "none",
  },
  compactTitle: {
    margin: 0,
    fontSize: "20px",
    lineHeight: "26px",
    fontWeight: 600,
    letterSpacing: "-0.015em",
    color: color.ink,
    overflowWrap: "anywhere",
  },
  status: {
    margin: 0,
    paddingTop: space.s5,
    fontSize: text.md,
    lineHeight: "20px",
    color: color.muted,
  },
  error: { margin: 0, fontSize: text.sm, lineHeight: 1.45, color: color.danger },
});
