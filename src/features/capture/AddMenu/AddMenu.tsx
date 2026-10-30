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
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import "./AddMenu.css";

// The sidebar's Add button opens into the menu in place, after Viora UI's
// Create New Disclosure (LICENSE.md). Rebuilt rather than copied: its tiles had
// no actions, it never closed on Escape or an outside click, and focus was
// lost when it opened or closed.

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
  onPickFile: (file: File) => void;
  onScreenshot: () => void;
  onAddSpace?: () => void;
};

const TITLES: Record<AddMode, string> = { note: "Note", url: "Link", quote: "Quote" };

export function AddMenu({
  collapsible = false,
  compact = false,
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
  onAddSpace,
}: Props) {
  const reducedMotion = useReducedMotion();
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Presence can mount a panel after the open-state effect has run. Focus
  // on the actual mount too, rather than depending on animation timing.
  const mountPanel = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
    node?.querySelector<HTMLElement>(".add-menu-tile")?.focus({ preventScroll: true });
  }, []);
  const compactRootRef = useRef<HTMLDivElement>(null);
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
    if (focusTriggerRef.current && triggerRef.current) {
      triggerRef.current.focus({ preventScroll: true });
      focusTriggerRef.current = false;
    }
  }, [open]);

  // Opening, or stepping back from a form, puts focus on the first tile. A form
  // focuses its own first field.
  useLayoutEffect(() => {
    if (!open || mode) return;
    const root = compact ? compactRootRef.current : panelRef.current;
    root
      ?.querySelector<HTMLElement>(compact ? ".compact-add-option" : ".add-menu-tile")
      ?.focus({ preventScroll: true });
  }, [open, mode, compact]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const root = compact ? compactRootRef.current : panelRef.current;
      if (
        event.target instanceof Node &&
        (root?.contains(event.target) || triggerRef.current?.contains(event.target))
      )
        return;
      onClose();
    };
    window.addEventListener("pointerdown", dismiss, true);
    return () => window.removeEventListener("pointerdown", dismiss, true);
  }, [open, onClose, compact]);

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

  if (compact) {
    const closeFromControl = () => {
      focusTriggerRef.current = true;
      onClose();
    };
    const options = [
      { label: "Note", icon: FileTextIcon },
      { label: "Link", icon: Link01Icon },
      { label: "Quote", icon: Bookmark01Icon },
      { label: "File", icon: Image01Icon },
      { label: "Screen", icon: Camera01Icon },
      ...(onAddSpace ? [{ label: "Space", icon: Folder01Icon }] : []),
    ];
    const selectOption = (label: string) => {
      if (label === "Note") onModeChange("note");
      else if (label === "Link") onModeChange("url");
      else if (label === "Quote") onModeChange("quote");
      else if (label === "File") {
        closeFromControl();
        fileRef.current?.click();
      } else if (label === "Screen") {
        focusTriggerRef.current = true;
        onScreenshot();
      } else {
        onClose();
        onAddSpace?.();
      }
    };
    return (
      <div
        ref={compactRootRef}
        className="add-menu compact-add"
        data-open={open && !mode}
        onKeyDownCapture={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (mode) onModeChange(null);
          else closeFromControl();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          hidden
          tabIndex={-1}
          accept="image/*,application/pdf,video/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onPickFile(file);
          }}
        />
        <div
          id={panelId}
          className="compact-add-stack"
          role="toolbar"
          aria-orientation="vertical"
          aria-label="Add to your library"
          aria-hidden={!open || Boolean(mode)}
          inert={!open || Boolean(mode)}
          onKeyDown={(event) => {
            if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
            ];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index + (event.key === "ArrowUp" ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.focus({ preventScroll: true });
          }}
        >
          {options.map((option, index) => (
            <button
              key={option.label}
              type="button"
              className="compact-add-option"
              style={{ "--add-index": index } as React.CSSProperties}
              aria-label={option.label === "Screen" ? "Screenshot" : option.label}
              data-tooltip={option.label === "Screen" ? "Screenshot" : option.label}
              disabled={saving}
              onClick={() => selectOption(option.label)}
            >
              <HugeiconsIcon icon={option.icon} size={16} />
            </button>
          ))}
        </div>
        {open && mode && (
          <div
            className="add-menu-panel compact-add-form"
            role="dialog"
            aria-label={`Add ${TITLES[mode]}`}
          >
            <div className="add-menu-header">
              <button
                type="button"
                className="add-menu-round"
                aria-label="Back"
                onClick={() => onModeChange(null)}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
              </button>
              <span className="add-menu-title">{TITLES[mode]}</span>
              <button
                type="button"
                className="add-menu-round"
                aria-label="Close"
                onClick={closeFromControl}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={13} />
              </button>
            </div>
            <div className="add-menu-body">
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
              {error && (
                <p className="add-menu-error" role="alert">
                  Couldn’t save this yet: {error}
                </p>
              )}
            </div>
          </div>
        )}
        <button
          ref={triggerRef}
          type="button"
          className="add-button codex-add-button"
          aria-label="Add"
          aria-expanded={open}
          aria-controls={panelId}
          data-tooltip="Add"
          disabled={saving}
          onClick={open ? closeFromControl : onOpen}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="add-menu" data-open={open}>
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
              <motion.span className="add-menu-title">{mode ? TITLES[mode] : "Add"}</motion.span>
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
              {error && (
                <p className="add-menu-error" role="alert">
                  Couldn’t save this yet: {error}
                </p>
              )}
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
