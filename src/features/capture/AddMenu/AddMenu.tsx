import {
  ArrowLeft01Icon,
  Bookmark01Icon,
  Camera01Icon,
  Cancel01Icon,
  FileTextIcon,
  Folder01Icon,
  Image01Icon,
  Link01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useId } from "react";
import { ADD_TITLES, AddError, AddForm, useAddDrafts } from "./AddForm";
import { CompactAddMenu } from "./CompactAddMenu";
import { useAddMenu } from "./useAddMenu";
import "./AddMenu.css";

// The sidebar's Add button opens into the menu in place, after Viora UI's
// Create New Disclosure (LICENSE.md).

export type AddMode = "note" | "url" | "quote";

type Props = {
  collapsible?: boolean;
  compact?: boolean;
  open: boolean;
  mode: AddMode | null;
  saving: boolean;
  error: string | null;
  onOpen: () => void;
  onClose: () => void;
  onModeChange: (mode: AddMode | null) => void;
  onSaveNote: (text: string) => Promise<boolean>;
  onSaveLink: (url: string) => Promise<boolean>;
  onSaveQuote: (text: string, attribution: string, sourceUrl: string) => Promise<boolean>;
  onPickFile: (files: File[]) => void;
  onScreenshot: () => void;
  onAddSpace?: () => void;
};

export type AddMenuLayoutProps = Omit<
  Props,
  "collapsible" | "compact" | "onSaveNote" | "onSaveLink" | "onSaveQuote"
> & {
  drafts: ReturnType<typeof useAddDrafts>;
  onSubmit: (event: React.FormEvent) => void;
};

export function AddMenu({
  collapsible = false,
  compact = false,
  onSaveNote,
  onSaveLink,
  onSaveQuote,
  ...props
}: Props) {
  // Drafts live here, not in either layout, so closing the menu or switching
  // layouts keeps them.
  const drafts = useAddDrafts();

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const { note, url, quote } = drafts;
    if (props.mode === "note" && note.trim()) {
      if (await onSaveNote(note.trim())) drafts.setNote("");
    } else if (props.mode === "url" && url.trim()) {
      if (await onSaveLink(url.trim())) drafts.setUrl("");
    } else if (props.mode === "quote" && quote.trim()) {
      if (await onSaveQuote(quote, drafts.attribution, drafts.sourceUrl)) {
        drafts.setQuote("");
        drafts.setAttribution("");
        drafts.setSourceUrl("");
      }
    }
  };

  return compact ? (
    <CompactAddMenu {...props} drafts={drafts} onSubmit={onSubmit} />
  ) : (
    <FloatingAddMenu {...props} collapsible={collapsible} drafts={drafts} onSubmit={onSubmit} />
  );
}

function FloatingAddMenu({
  collapsible,
  open,
  mode,
  saving,
  error,
  drafts,
  onSubmit,
  onOpen,
  onClose,
  onModeChange,
  onPickFile,
  onScreenshot,
  onAddSpace,
}: AddMenuLayoutProps & { collapsible: boolean }) {
  const reducedMotion = useReducedMotion();
  const panelId = useId();
  const { rootRef, triggerRef, fileRef, focusTriggerRef, pickFiles } = useAddMenu({
    open,
    mode,
    onClose,
    onPickFile,
    firstOption: ".add-menu-tile",
  });
  // Presence can mount a panel after the open-state effect has run. Focus
  // on the actual mount too, rather than depending on animation timing.
  const mountPanel = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      node?.querySelector<HTMLElement>(".add-menu-tile")?.focus({ preventScroll: true });
    },
    [rootRef],
  );

  // Escape is handled by useAppShortcuts, which steps back from a form before closing.
  const onKeyDownCapture = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && !mode) focusTriggerRef.current = true;
  };

  return (
    <div className="add-menu" data-open={open}>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose files"
        onChange={pickFiles}
      />
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            ref={mountPanel}
            id={panelId}
            className="add-menu-panel add-menu-floating-panel"
            role="dialog"
            aria-label="Add to your library"
            style={{ borderRadius: 18, transformOrigin: "bottom center" }}
            initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.94, y: reducedMotion ? 0 : 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.94, y: reducedMotion ? 0 : 12 }}
            transition={{ duration: reducedMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            onKeyDownCapture={onKeyDownCapture}
          >
            <div className="add-menu-header">
              {mode && (
                <button
                  type="button"
                  className="add-menu-round"
                  aria-label="Back"
                  data-tooltip="Back"
                  onClick={() => onModeChange(null)}
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
                </button>
              )}
              <span className="add-menu-title">{mode ? ADD_TITLES[mode] : "Add"}</span>
              <button
                type="button"
                className="add-menu-round"
                aria-label="Close"
                data-tooltip="Close"
                onClick={() => {
                  focusTriggerRef.current = true;
                  onClose();
                }}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2.2} />
              </button>
            </div>
            {/* Fades in once the outline has mostly grown, so the morph
                never stretches the tiles or the fields. */}
            <motion.div
              key={mode ?? "grid"}
              className="add-menu-body"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.08, duration: 0.18 } }}
            >
              {mode ? (
                <AddForm mode={mode} saving={saving} drafts={drafts} onSubmit={onSubmit} />
              ) : (
                <div className="add-menu-grid">
                  <Tile icon={FileTextIcon} label="Note" onSelect={() => onModeChange("note")} />
                  <Tile icon={Link01Icon} label="Link" onSelect={() => onModeChange("url")} />
                  <Tile
                    icon={Bookmark01Icon}
                    label="Quote"
                    onSelect={() => onModeChange("quote")}
                  />
                  <Tile
                    icon={Image01Icon}
                    label="File"
                    disabled={saving}
                    onSelect={() => fileRef.current?.click()}
                  />
                  <Tile
                    icon={Camera01Icon}
                    label="Screen"
                    ariaLabel="Screenshot"
                    disabled={saving}
                    onSelect={onScreenshot}
                  />
                  {onAddSpace && (
                    <Tile
                      icon={Folder01Icon}
                      label="Space"
                      ariaLabel="Space"
                      tooltip="Space"
                      onSelect={() => {
                        onClose();
                        onAddSpace();
                      }}
                    />
                  )}
                </div>
              )}
              <AddError error={error} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* The fixed trigger stays below the floating panel, never stretching,
          overlapping its content or disappearing between presence phases. */}
      <button
        ref={triggerRef}
        type="button"
        className={collapsible ? "add-button codex-add-button" : "add-button"}
        aria-label="Add"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={saving}
        onClick={open ? onClose : onOpen}
      >
        <HugeiconsIcon icon={PlusSignIcon} size={16} />
        <span className={collapsible ? "codex-label" : undefined}>
          {saving ? "Saving…" : "Add"}
        </span>
      </button>
    </div>
  );
}

function Tile({
  icon,
  label,
  ariaLabel,
  tooltip,
  disabled,
  onSelect,
}: {
  icon: IconSvgElement;
  label: string;
  ariaLabel?: string;
  tooltip?: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="add-menu-tile"
      aria-label={ariaLabel}
      data-tooltip={tooltip}
      disabled={disabled}
      onClick={onSelect}
    >
      <HugeiconsIcon icon={icon} size={22} strokeWidth={1.5} />
      <span>{label}</span>
    </button>
  );
}
