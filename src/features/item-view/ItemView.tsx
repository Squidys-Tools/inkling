import { Tabs } from "@base-ui/react/tabs";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { isElectronRuntime } from "../../lib/libraryApi";
import type { LibraryItem } from "../../lib/types";
import type { ReaderOrigin } from "../../ReaderView";
import { cx } from "../../ui/cx";
import { InfoPanel, NOTE_BOX } from "./InfoPanel";
import { ItemActionBar } from "./ItemActionBar";
import { ItemStageMedia } from "./ItemStageMedia";
import { itemViewTitle } from "./ItemTitle";
import type { SourceRects } from "./overlayMotion";
import { SimilarPanel, useSimilarItems } from "./SimilarPanel";
import { useItemFlight } from "./useItemFlight";

const RichNoteEditor = lazy(() =>
  import("./RichNoteEditor").then((module) => ({ default: module.RichNoteEditor })),
);

export type ItemViewActions = {
  onClose: () => void;
  onOpenPdf: (item: LibraryItem) => void;
  onOpenReader: (item: LibraryItem, origin: ReaderOrigin) => void;
  onForget: (item: LibraryItem) => void | Promise<void>;
  onRetryJob: (jobId: string) => void | Promise<void>;
  onAddTag?: (item: LibraryItem, tag: string) => void | Promise<void>;
  onUpdateNote: (item: LibraryItem, body: string) => void | Promise<void>;
  onToggleSpace?: (item: LibraryItem, spaceId: string) => void | Promise<void>;
  /** Items similar to this one, for the Similar tab. */
  onLoadSimilar: (item: LibraryItem) => Promise<LibraryItem[]>;
  /** Opens another item from the Similar tab as a new history step. */
  onOpenItem: (item: LibraryItem) => void;
  /** Hidden when absent. */
  onShowInFolder?: (item: LibraryItem) => void;
  /** Permanent delete. Only offered for archived items. Hidden when absent. */
  onDelete?: (item: LibraryItem) => void;
};

/** A Regular Space in the Space menu: filing an item in and taking it back out
 *  happen in the same place, so one toggle carries both directions. */
export type ItemViewSpace = {
  id: string;
  name: string;
  color: string;
  member: boolean;
};

const INSPECTOR_BODY =
  "flex min-h-0 flex-auto flex-col gap-5 overflow-y-auto pt-5 [scrollbar-width:none]";
const INSPECTOR_TAB =
  "cursor-pointer border-0 bg-transparent p-0 font-body text-[14px]/[18px] text-muted hover:not-data-active:text-ink-soft data-active:font-semibold data-active:text-ink";

type InspectorTab = "info" | "similar";

type ItemViewProps = {
  item: LibraryItem;
  actions: ItemViewActions;
  /** Regular Spaces available to file this item in. Empty hides the Space control. */
  spaces?: ItemViewSpace[];
  originRectsRef: RefObject<SourceRects | null>;
  /** The library frame the item view covers once it settles. */
  frameRef: RefObject<HTMLElement | null>;
  historyCloseRequest: number;
};

export function ItemView({
  item,
  actions,
  spaces,
  originRectsRef,
  frameRef,
  historyCloseRequest,
}: ItemViewProps) {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("info");

  // Leave the editor rather than carry the draft onto another item.
  const leaveEditor = useCallback(() => {
    setIsEditingNote(false);
    setIsFocusMode(false);
  }, []);
  const {
    layerRef,
    dialogRef,
    closeButtonRef,
    flight,
    destination,
    shownItem,
    requestClose,
    archiveFromView,
  } = useItemFlight({
    item,
    actions,
    originRectsRef,
    frameRef,
    historyCloseRequest,
    leaveEditor,
  });

  // The draft lives only in the editor, so while a note is being written a
  // press outside the item view (a Space, Settings, a card) is absorbed rather
  // than navigating away and dropping it. Save, Close and Escape are the ways
  // out. Press, release and click are separate events a control can answer.
  useEffect(() => {
    if (!isEditingNote) return;
    const absorb = (event: Event) => {
      if (!(event.target instanceof Node) || dialogRef.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const events = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
    for (const type of events) document.addEventListener(type, absorb, true);
    return () => {
      for (const type of events) document.removeEventListener(type, absorb, true);
    };
  }, [isEditingNote, dialogRef]);

  const handleOverlayClose = () => {
    if (isFocusMode) setIsFocusMode(false);
    else if (isEditingNote) setIsEditingNote(false);
    else requestClose();
  };
  const closeOnEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    // A field or menu inside the view owns its own Escape: the new-tag input,
    // the editor's link URL field and the Space menu each cancel just
    // themselves. This listener runs in the capture phase, before they can.
    if (event.target instanceof HTMLInputElement) return;
    if (event.target instanceof Element && event.target.closest("[role=menu]")) return;
    event.stopPropagation();
    handleOverlayClose();
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => closeOnEscape(event);
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // Another item resets the tab. The tag draft and Space menu reset by their own keys.
  const [tabItemId, setTabItemId] = useState(shownItem.id);
  if (tabItemId !== shownItem.id) {
    setTabItemId(shownItem.id);
    setInspectorTab("info");
  }

  const similarItems = useSimilarItems(
    shownItem,
    inspectorTab === "similar",
    actions.onLoadSimilar,
  );

  const isFlying = flight !== null;
  const placedStyle: CSSProperties | undefined =
    destination && !isFlying
      ? {
          left: destination.left,
          top: destination.top,
          width: destination.width,
          height: destination.height,
        }
      : undefined;

  const isEditingNoteView = isEditingNote && shownItem.kind === "Note";
  const isFocusModeView = isFocusMode && isEditingNoteView;
  const memberSpaces = spaces?.filter((space) => space.member) ?? [];

  // Classes that override each other are picked here rather than stacked as
  // variants, because media-query variants sort after the state ones.
  return (
    <div
      className={cx(
        "fixed inset-0 in-[.settings-open]:z-130",
        isFocusModeView
          ? "pointer-events-auto z-70 grid place-items-center bg-[#100f0e] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_50%_42%,rgba(176,113,79,0.09),transparent_58%)] before:content-['']"
          : "pointer-events-none z-6",
      )}
      ref={layerRef}
    >
      <section
        ref={dialogRef}
        className={cx(
          "expanded-overlay group/item pointer-events-auto overflow-hidden [--item-progress:1] [--item-inset:8px] [--item-inspector-top:calc(3px_+_var(--spacing-titlebar))]",
          isFocusModeView
            ? "relative z-1 h-full w-[min(100%,1060px)] rounded-none bg-transparent"
            : "absolute top-0 left-0 size-0 rounded-l-[calc(var(--radius-frame)_-_1px)] bg-frame",
          isFlying && "will-change-[left,top,width,height,opacity]",
        )}
        data-flying={isFlying || undefined}
        role="dialog"
        aria-modal={false}
        aria-label={itemViewTitle(shownItem)}
        style={isFocusModeView ? undefined : placedStyle}
      >
        <div
          className={cx(
            "absolute overflow-hidden border [--item-stage-surface:radial-gradient(circle,#2a2623_1px,transparent_1.2px)_0_0/18px_18px_#121110] [background:var(--item-stage-surface)]",
            isEditingNoteView ? "hidden" : "grid place-items-center",
            "top-[calc(var(--item-inset)*var(--item-progress))] right-[calc(320px*var(--item-progress))] bottom-[calc(var(--item-inset)*var(--item-progress))] left-[calc(var(--item-inset)*var(--item-progress))] rounded-[calc(var(--radius-frame)_-_1px)] border-border px-[calc(40px*var(--item-progress))] py-[calc(60px*var(--item-progress))] max-[780px]:top-[calc(var(--item-inspector-top)*var(--item-progress))] max-[780px]:right-[calc(var(--item-inset)*var(--item-progress))] max-[780px]:bottom-[calc(50%*var(--item-progress))] max-[780px]:p-[calc(16px*var(--item-progress))]",
          )}
        >
          <ItemStageMedia item={shownItem} />
        </div>

        <Tabs.Root
          value={inspectorTab}
          onValueChange={(value) => setInspectorTab(value === "similar" ? "similar" : "info")}
          render={<aside />}
          className={cx(
            "absolute top-(--item-inspector-top) right-0 bottom-(--item-inset) flex flex-col font-body",
            isEditingNoteView
              ? "left-(--item-inset) w-auto px-0 pt-1.5"
              : "w-80 pt-1.5 pr-4 pl-[18px] max-[780px]:top-1/2 max-[780px]:left-0 max-[780px]:w-auto",
            "opacity-[var(--item-progress)] [translate:calc(24px*(1_-_var(--item-progress)))_0]",
            isFlying && "pointer-events-none",
          )}
        >
          <header
            className={cx(
              "flex h-10 flex-none items-center justify-between",
              isEditingNoteView && "px-4",
            )}
          >
            {/* The tabs step aside while the note editor owns the inspector. */}
            {!isEditingNoteView && (
              <Tabs.List activateOnFocus className="flex items-center gap-[18px]">
                <Tabs.Tab value="info" className={INSPECTOR_TAB}>
                  Info
                </Tabs.Tab>
                <Tabs.Tab value="similar" className={INSPECTOR_TAB}>
                  Similar
                </Tabs.Tab>
              </Tabs.List>
            )}
            <button
              type="button"
              ref={closeButtonRef}
              className={cx(
                "ml-auto inline-flex cursor-pointer items-center gap-1.5 border-0",
                isFocusModeView
                  ? cx(
                      "fixed right-7 min-w-[92px] rounded-full bg-surface-raised px-3 font-body text-[11px] leading-[normal] text-[#c8c0b5] hover:bg-[#25211e] max-[680px]:right-3.5",
                      // In the desktop app, Exit focus must clear the window controls' band.
                      isElectronRuntime()
                        ? "top-[calc(4px_+_var(--spacing-titlebar))]"
                        : "top-[22px] max-[680px]:top-3.5",
                    )
                  : "bg-transparent p-0 font-sans text-[12px]/4 text-muted hover:text-ink",
              )}
              onClick={handleOverlayClose}
              aria-label={
                isFocusModeView
                  ? "Exit focus mode"
                  : isEditingNoteView
                    ? "Close editor"
                    : "Close details"
              }
            >
              {isFocusModeView ? "Exit focus" : "Close"}
              <kbd className="rounded-[4px] border border-border px-[5px] py-px font-mono text-[10px]/3 text-muted">
                esc
              </kbd>
            </button>
          </header>

          {isEditingNoteView ? (
            <div className="flex min-h-0 flex-auto flex-col overflow-hidden">
              <Suspense
                fallback={
                  <p className={NOTE_BOX} role="status">
                    Loading editor…
                  </p>
                }
              >
                <RichNoteEditor
                  key={`edit-${shownItem.id}`}
                  body={shownItem.noteBody}
                  title={shownItem.title}
                  onSave={(body) => actions.onUpdateNote(shownItem, body)}
                  onEditingChange={(editing) => {
                    setIsEditingNote(editing);
                    if (!editing) setIsFocusMode(false);
                  }}
                  focusMode={isFocusModeView}
                  onFocusModeChange={setIsFocusMode}
                />
              </Suspense>
            </div>
          ) : (
            <>
              <Tabs.Panel value="info" tabIndex={-1} className={INSPECTOR_BODY}>
                <InfoPanel
                  item={shownItem}
                  actions={actions}
                  memberSpaces={memberSpaces}
                  onEditNote={() => {
                    setIsFocusMode(false);
                    setIsEditingNote(true);
                  }}
                />
              </Tabs.Panel>
              <Tabs.Panel value="similar" tabIndex={-1} className={INSPECTOR_BODY}>
                <SimilarPanel item={shownItem} similar={similarItems} onOpen={actions.onOpenItem} />
              </Tabs.Panel>
            </>
          )}

          {!isEditingNoteView && (
            <ItemActionBar
              item={shownItem}
              actions={actions}
              spaces={spaces}
              onArchive={archiveFromView}
            />
          )}
        </Tabs.Root>
      </section>
    </div>
  );
}
