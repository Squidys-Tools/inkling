import type { RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Bookmark01Icon,
  Camera01Icon,
  Cancel01Icon,
  FileTextIcon,
  Image01Icon,
  Link01Icon,
} from "@hugeicons/core-free-icons";
import { useDialog } from "./dialog/useDialog";

export type CaptureMode = "note" | "url" | "file" | "quote";

export type CaptureModalProps = {
  open: boolean;
  captureMode: CaptureMode | null;
  onSelectMode: (mode: CaptureMode) => void;
  onCloseMode: () => void;
  onClose: () => void;
  onStartScreenshot: () => void;
  onSubmit: (event: React.FormEvent) => void;
  isCapturing: boolean;
  error: string | null;
  note: string;
  onNoteChange: (value: string) => void;
  url: string;
  onUrlChange: (value: string) => void;
  quoteText: string;
  onQuoteTextChange: (value: string) => void;
  quoteAttribution: string;
  onQuoteAttributionChange: (value: string) => void;
  quoteSourceUrl: string;
  onQuoteSourceUrlChange: (value: string) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
};

/* The Add sheet: pick a kind, then fill in that one form. Escape arbitration and
   the focus trap come from the shared dialog primitive, so opening settings from
   underneath still closes this one first. */
export function CaptureModal(props: CaptureModalProps) {
  const {
    open,
    captureMode,
    onSelectMode,
    onCloseMode,
    onClose,
    onStartScreenshot,
    onSubmit,
    isCapturing,
    error,
    note,
    onNoteChange,
    url,
    onUrlChange,
    quoteText,
    onQuoteTextChange,
    quoteAttribution,
    onQuoteAttributionChange,
    quoteSourceUrl,
    onQuoteSourceUrlChange,
    file,
    onFileChange,
    fileInputRef,
  } = props;
  const captureDialog = useDialog({ open, onClose });

  return (
  <AnimatePresence>
    {open && (
      <motion.div
        key="capture-modal"
        className="capture-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      >
        <motion.section
          className="capture-modal"
          ref={captureDialog.dialogRef}
          {...captureDialog.rootProps}
          initial={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
          animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
          exit={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
        <header className="capture-modal-header">
          <div>
            <h2 {...captureDialog.labelProps}>Add to your library</h2>
            <p>Choose what you want to save.</p>
          </div>
          <button className="icon-button small" type="button" onClick={onClose} aria-label="Close add menu"><HugeiconsIcon icon={Cancel01Icon} size={16} /></button>
        </header>

        <div className="capture-options" aria-label="Add options">
          <button type="button" className={`capture-option ${captureMode === "note" ? "selected" : ""}`} onClick={() => onSelectMode("note")} aria-pressed={captureMode === "note"}>
            <span className="capture-option-icon"><HugeiconsIcon icon={FileTextIcon} size={18} /></span>
            <span className="capture-option-copy"><strong>Note</strong><span>Write something to remember.</span></span>
          </button>
          <button type="button" className={`capture-option ${captureMode === "url" ? "selected" : ""}`} onClick={() => onSelectMode("url")} aria-pressed={captureMode === "url"}>
            <span className="capture-option-icon"><HugeiconsIcon icon={Link01Icon} size={18} /></span>
            <span className="capture-option-copy"><strong>Link</strong><span>Save an article, page, or X post.</span></span>
          </button>
          <button type="button" className={`capture-option ${captureMode === "file" ? "selected" : ""}`} onClick={() => onSelectMode("file")} aria-pressed={captureMode === "file"}>
            <span className="capture-option-icon"><HugeiconsIcon icon={Image01Icon} size={18} /></span>
            <span className="capture-option-copy"><strong>File</strong><span>Upload an image, PDF, or video.</span></span>
          </button>
          <button type="button" className={`capture-option ${captureMode === "quote" ? "selected" : ""}`} onClick={() => onSelectMode("quote")} aria-pressed={captureMode === "quote"}>
            <span className="capture-option-icon"><HugeiconsIcon icon={Bookmark01Icon} size={18} /></span>
            <span className="capture-option-copy"><strong>Quote</strong><span>Save a passage with its source.</span></span>
          </button>
          <button type="button" className="capture-option" onClick={onStartScreenshot} disabled={isCapturing}>
            <span className="capture-option-icon"><HugeiconsIcon icon={Camera01Icon} size={18} /></span>
            <span className="capture-option-copy"><strong>Screenshot</strong><span>Capture a window or display.</span></span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {captureMode && (
            <motion.form
              key={captureMode}
              className="capture-editor"
              initial={{ opacity: 0, transform: "translateY(6px)" }}
              animate={{ opacity: 1, transform: "translateY(0)" }}
              exit={{ opacity: 0, transform: "translateY(-4px)" }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onSubmit={onSubmit}
            >
            <div className="capture-editor-heading">
              <strong>{captureMode === "note" ? "New note" : captureMode === "quote" ? "New quote" : captureMode === "url" ? "Save a link" : "Upload a file"}</strong>
            </div>
            {captureMode === "note" && <input
              autoFocus
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="A thought, a link, a small beginning…"
              aria-label="New note"
            />}
            {captureMode === "url" && <input
              autoFocus
              type="text"
              inputMode="url"
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder="Paste a link to save and read later (example.com works too)…"
              aria-label="URL to save"
            />}
            {captureMode === "quote" && <div className="quote-capture-fields">
              <textarea
                autoFocus
                value={quoteText}
                onChange={(event) => onQuoteTextChange(event.target.value)}
                placeholder="“The mind is a place with weather…”"
                aria-label="Quote text"
                rows={3}
                maxLength={2000}
              />
              <div className="quote-capture-row">
                <input
                  value={quoteAttribution}
                  onChange={(event) => onQuoteAttributionChange(event.target.value)}
                  placeholder="Attribution"
                  aria-label="Quote attribution"
                  maxLength={240}
                />
                <input
                  type="text"
                  value={quoteSourceUrl}
                  onChange={(event) => onQuoteSourceUrlChange(event.target.value)}
                  placeholder="Source URL (optional)"
                  aria-label="Quote source URL"
                  inputMode="url"
                />
              </div>
            </div>}
            {captureMode === "file" && <>
              <input
                ref={fileInputRef}
                type="file"
                className="visually-hidden"
                accept="image/*,application/pdf,video/*"
                onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
              />
              <button type="button" className="file-picker" onClick={() => fileInputRef.current?.click()}>
                {file ? file.name : "Choose an image, PDF, or video"}
              </button>
            </>}
            <div className="capture-editor-actions">
              <button className="capture-cancel" type="button" onClick={onCloseMode}>Back</button>
              <button className="capture-save" type="submit" disabled={isCapturing}>{isCapturing ? "Saving…" : "Save to library"}</button>
            </div>
            </motion.form>
          )}
        </AnimatePresence>

        {error && <p className="capture-error" role="alert">Couldn’t save this yet: {error}</p>}
        </motion.section>
      </motion.div>
    )}
  </AnimatePresence>
  );
}
