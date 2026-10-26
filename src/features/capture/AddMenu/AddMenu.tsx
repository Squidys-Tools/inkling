import {
  ArrowLeft01Icon,
  Bookmark01Icon,
  Camera01Icon,
  Cancel01Icon,
  FileTextIcon,
  Image01Icon,
  Link01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import "./AddMenu.css";

// The sidebar's Add button opens into the menu in place, after Viora UI's
// Create New Disclosure (LICENSE.md). Rebuilt rather than copied: its tiles had
// no actions, it never closed on Escape or an outside click, and focus was
// lost when it opened or closed.

export type AddMode = "note" | "url" | "quote";

type Props = {
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
  onPickFile: (file: File) => void;
  onScreenshot: () => void;
};

const SPRING = { type: "spring", bounce: 0.1, duration: 0.4 } as const;
const TITLES: Record<AddMode, string> = { note: "Note", url: "Link", quote: "Quote" };

export function AddMenu({
  open,
  mode,
  saving,
  error,
  onOpen,
  onClose,
  onModeChange,
  onSaveNote,
  onSaveLink,
  onSaveQuote,
  onPickFile,
  onScreenshot,
}: Props) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const focusTriggerRef = useRef(false);
  // Drafts live here, not in the panel, so closing the menu keeps them.
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [quote, setQuote] = useState("");
  const [attribution, setAttribution] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  // Closing from inside the menu (Escape, the close button) hands focus back
  // to Add once it is back; an outside click leaves focus where it landed.
  useLayoutEffect(() => {
    if (open) return;
    if (focusTriggerRef.current) triggerRef.current?.focus();
    focusTriggerRef.current = false;
  }, [open]);

  // Opening, or stepping back from a form, puts focus on the first tile. A form
  // focuses its own first field.
  useLayoutEffect(() => {
    if (!open || mode) return;
    panelRef.current?.querySelector<HTMLElement>(".add-menu-tile")?.focus({ preventScroll: true });
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", dismiss, true);
    return () => window.removeEventListener("pointerdown", dismiss, true);
  }, [open, onClose]);

  // Escape is handled by App, which steps back from a form before closing.
  const onKeyDownCapture = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && !mode) focusTriggerRef.current = true;
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "note" && note.trim()) {
      if (await onSaveNote(note.trim())) setNote("");
    } else if (mode === "url" && url.trim()) {
      if (await onSaveLink(url.trim())) setUrl("");
    } else if (mode === "quote" && quote.trim()) {
      if (await onSaveQuote(quote, attribution, sourceUrl)) {
        setQuote("");
        setAttribution("");
        setSourceUrl("");
      }
    }
  };

  return (
    <div className="add-menu">
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept="image/*,application/pdf,video/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onPickFile(file);
        }}
      />
      <AnimatePresence mode="popLayout" initial={false}>
        {open ? (
          <motion.div
            key="panel"
            ref={panelRef}
            id={panelId}
            className="add-menu-panel"
            role="dialog"
            aria-label="Add to your library"
            layoutId="add-menu"
            style={{ borderRadius: 18 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={SPRING}
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
              <motion.span layoutId="add-menu-label" className="add-menu-title" transition={SPRING}>
                {mode ? TITLES[mode] : "Add"}
              </motion.span>
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
                <AddForm
                  mode={mode}
                  saving={saving}
                  note={note}
                  url={url}
                  quote={quote}
                  attribution={attribution}
                  sourceUrl={sourceUrl}
                  onNote={setNote}
                  onUrl={setUrl}
                  onQuote={setQuote}
                  onAttribution={setAttribution}
                  onSourceUrl={setSourceUrl}
                  onSubmit={save}
                />
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
                </div>
              )}
              {error && (
                <p className="add-menu-error" role="alert">
                  Couldn’t save this yet: {error}
                </p>
              )}
            </motion.div>
          </motion.div>
        ) : (
          <motion.button
            key="trigger"
            ref={triggerRef}
            type="button"
            className="add-button"
            layoutId="add-menu"
            style={{ borderRadius: 12 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={SPRING}
            aria-expanded={false}
            aria-controls={panelId}
            disabled={saving}
            data-tooltip="Add something to your library"
            onClick={onOpen}
          >
            <HugeiconsIcon icon={PlusSignIcon} size={16} />
            <motion.span layoutId="add-menu-label" transition={SPRING}>
              {saving ? "Saving…" : "Add"}
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function Tile({
  icon,
  label,
  ariaLabel,
  disabled,
  onSelect,
}: {
  icon: IconSvgElement;
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="add-menu-tile"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onSelect}
    >
      <HugeiconsIcon icon={icon} size={22} strokeWidth={1.5} />
      <span>{label}</span>
    </button>
  );
}

type FormProps = {
  mode: AddMode;
  saving: boolean;
  note: string;
  url: string;
  quote: string;
  attribution: string;
  sourceUrl: string;
  onNote: (value: string) => void;
  onUrl: (value: string) => void;
  onQuote: (value: string) => void;
  onAttribution: (value: string) => void;
  onSourceUrl: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

function AddForm(props: FormProps) {
  const { mode, saving, onSubmit } = props;
  const formRef = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    formRef.current?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
  }, []);
  return (
    <form ref={formRef} className="add-menu-form" onSubmit={onSubmit}>
      {mode === "note" && (
        <textarea
          value={props.note}
          onChange={(event) => props.onNote(event.target.value)}
          onKeyDown={(event) => {
            // Enter saves; Shift+Enter starts a new line. An Enter that confirms
            // an IME composition only finishes the word.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="A thought, a small beginning…"
          aria-label="New note"
          rows={3}
        />
      )}
      {mode === "url" && (
        <input
          type="text"
          inputMode="url"
          value={props.url}
          onChange={(event) => props.onUrl(event.target.value)}
          placeholder="Paste a link"
          aria-label="URL to save"
        />
      )}
      {mode === "quote" && (
        <>
          <textarea
            value={props.quote}
            onChange={(event) => props.onQuote(event.target.value)}
            placeholder="“The mind is a place with weather…”"
            aria-label="Quote text"
            rows={3}
            maxLength={2000}
          />
          <input
            value={props.attribution}
            onChange={(event) => props.onAttribution(event.target.value)}
            placeholder="Attribution"
            aria-label="Quote attribution"
            maxLength={240}
          />
          <input
            type="text"
            inputMode="url"
            value={props.sourceUrl}
            onChange={(event) => props.onSourceUrl(event.target.value)}
            placeholder="Source URL (optional)"
            aria-label="Quote source URL"
          />
        </>
      )}
      <button className="add-menu-save" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save to library"}
      </button>
    </form>
  );
}
