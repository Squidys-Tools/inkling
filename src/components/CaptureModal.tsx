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
        className="capture-modal-backdrop fixed inset-0 z-[100] grid place-items-center p-6 bg-[rgba(10,10,9,.72)] max-[780px]:items-end max-[780px]:p-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      >
        <motion.section
          className="capture-modal w-[min(520px,100%)] max-h-[calc(100vh-32px)] overflow-y-auto p-5 rounded-[14px] border border-[#4a4842] bg-surface shadow-[0_24px_70px_rgba(0,0,0,.5)] [scrollbar-width:none] max-[780px]:max-h-[calc(100vh-24px)]"
          ref={captureDialog.dialogRef}
          {...captureDialog.rootProps}
          initial={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
          animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
          exit={{ opacity: 0, transform: "translateY(8px) scale(0.98)" }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
        <header className="capture-modal-header flex items-start justify-between gap-[14px] pb-[14px] border-b border-rule">
          <div>
            <h2 {...captureDialog.labelProps} className="m-0 font-sans text-[20px] font-medium leading-[1.15] tracking-[-.03em] text-ink">Add to your library</h2>
            <p className="m-[4px_0_0] text-xs text-muted">Choose what you want to save.</p>
          </div>
          <button className="icon-button small inline-grid size-[26px] place-items-center cursor-pointer rounded-[8px] border border-transparent bg-transparent text-muted transition-[background,color,border-color] duration-[.18s] ease-[cubic-bezier(.25,.1,.25,1)] hover:bg-surface hover:text-ink hover:border-rule" type="button" onClick={onClose} aria-label="Close add menu"><HugeiconsIcon icon={Cancel01Icon} size={16} /></button>
        </header>

        <div className="capture-options grid grid-cols-2 gap-1.5 mt-[14px] max-[780px]:grid-cols-1" aria-label="Add options">
          <button type="button" className={`capture-option ${captureMode === "note" ? "selected" : ""} flex items-start min-h-[68px] gap-2.5 cursor-pointer p-[10px_11px] text-left text-ink bg-[#232320] rounded-[9px] border border-rule transition-[background,border-color,transform] duration-[.18s] ease-[cubic-bezier(.25,.1,.25,1)] [&.selected]:border-[#6b8f7a] [&.selected]:bg-green-soft hover:border-[#5a5750] hover:bg-[#292925] hover:-translate-y-px active:not-disabled:scale-[.96] disabled:cursor-wait disabled:opacity-60`} onClick={() => onSelectMode("note")} aria-pressed={captureMode === "note"}>
            <span className="capture-option-icon grid size-[28px] shrink-0 place-items-center rounded-[7px] bg-[#2e3d34] text-[#9db8a6]"><HugeiconsIcon icon={FileTextIcon} size={18} /></span>
            <span className="capture-option-copy grid min-w-0 gap-0.5"><strong className="text-[13px] font-semibold">Note</strong><span className="text-[11px] leading-[1.3] text-muted">Write something to remember.</span></span>
          </button>
          <button type="button" className={`capture-option ${captureMode === "url" ? "selected" : ""} flex items-start min-h-[68px] gap-2.5 cursor-pointer p-[10px_11px] text-left text-ink bg-[#232320] rounded-[9px] border border-rule transition-[background,border-color,transform] duration-[.18s] ease-[cubic-bezier(.25,.1,.25,1)] [&.selected]:border-[#6b8f7a] [&.selected]:bg-green-soft hover:border-[#5a5750] hover:bg-[#292925] hover:-translate-y-px active:not-disabled:scale-[.96] disabled:cursor-wait disabled:opacity-60`} onClick={() => onSelectMode("url")} aria-pressed={captureMode === "url"}>
            <span className="capture-option-icon grid size-[28px] shrink-0 place-items-center rounded-[7px] bg-[#2e3d34] text-[#9db8a6]"><HugeiconsIcon icon={Link01Icon} size={18} /></span>
            <span className="capture-option-copy grid min-w-0 gap-0.5"><strong className="text-[13px] font-semibold">Link</strong><span className="text-[11px] leading-[1.3] text-muted">Save an article, page, or X post.</span></span>
          </button>
          <button type="button" className={`capture-option ${captureMode === "file" ? "selected" : ""} flex items-start min-h-[68px] gap-2.5 cursor-pointer p-[10px_11px] text-left text-ink bg-[#232320] rounded-[9px] border border-rule transition-[background,border-color,transform] duration-[.18s] ease-[cubic-bezier(.25,.1,.25,1)] [&.selected]:border-[#6b8f7a] [&.selected]:bg-green-soft hover:border-[#5a5750] hover:bg-[#292925] hover:-translate-y-px active:not-disabled:scale-[.96] disabled:cursor-wait disabled:opacity-60`} onClick={() => onSelectMode("file")} aria-pressed={captureMode === "file"}>
            <span className="capture-option-icon grid size-[28px] shrink-0 place-items-center rounded-[7px] bg-[#2e3d34] text-[#9db8a6]"><HugeiconsIcon icon={Image01Icon} size={18} /></span>
            <span className="capture-option-copy grid min-w-0 gap-0.5"><strong className="text-[13px] font-semibold">File</strong><span className="text-[11px] leading-[1.3] text-muted">Upload an image, PDF, or video.</span></span>
          </button>
          <button type="button" className={`capture-option ${captureMode === "quote" ? "selected" : ""} flex items-start min-h-[68px] gap-2.5 cursor-pointer p-[10px_11px] text-left text-ink bg-[#232320] rounded-[9px] border border-rule transition-[background,border-color,transform] duration-[.18s] ease-[cubic-bezier(.25,.1,.25,1)] [&.selected]:border-[#6b8f7a] [&.selected]:bg-green-soft hover:border-[#5a5750] hover:bg-[#292925] hover:-translate-y-px active:not-disabled:scale-[.96] disabled:cursor-wait disabled:opacity-60`} onClick={() => onSelectMode("quote")} aria-pressed={captureMode === "quote"}>
            <span className="capture-option-icon grid size-[28px] shrink-0 place-items-center rounded-[7px] bg-[#2e3d34] text-[#9db8a6]"><HugeiconsIcon icon={Bookmark01Icon} size={18} /></span>
            <span className="capture-option-copy grid min-w-0 gap-0.5"><strong className="text-[13px] font-semibold">Quote</strong><span className="text-[11px] leading-[1.3] text-muted">Save a passage with its source.</span></span>
          </button>
          <button type="button" className="capture-option flex items-start min-h-[68px] gap-2.5 cursor-pointer p-[10px_11px] text-left text-ink bg-[#232320] rounded-[9px] border border-rule transition-[background,border-color,transform] duration-[.18s] ease-[cubic-bezier(.25,.1,.25,1)] hover:border-[#5a5750] hover:bg-[#292925] hover:-translate-y-px active:not-disabled:scale-[.96] disabled:cursor-wait disabled:opacity-60" onClick={onStartScreenshot} disabled={isCapturing}>
            <span className="capture-option-icon grid size-[28px] shrink-0 place-items-center rounded-[7px] bg-[#2e3d34] text-[#9db8a6]"><HugeiconsIcon icon={Camera01Icon} size={18} /></span>
            <span className="capture-option-copy grid min-w-0 gap-0.5"><strong className="text-[13px] font-semibold">Screenshot</strong><span className="text-[11px] leading-[1.3] text-muted">Capture a window or display.</span></span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {captureMode && (
            <motion.form
              key={captureMode}
              className="capture-editor mt-[14px] grid gap-2.5 border-t border-rule pt-[14px]"
              initial={{ opacity: 0, transform: "translateY(6px)" }}
              animate={{ opacity: 1, transform: "translateY(0)" }}
              exit={{ opacity: 0, transform: "translateY(-4px)" }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              onSubmit={onSubmit}
            >
            <div className="capture-editor-heading flex items-baseline justify-between gap-3">
              <strong className="text-[13px] font-semibold">{captureMode === "note" ? "New note" : captureMode === "quote" ? "New quote" : captureMode === "url" ? "Save a link" : "Upload a file"}</strong>
            </div>
            {captureMode === "note" && <input
              autoFocus
              className="w-full h-10 p-[0_11px] text-[13px] text-ink bg-paper rounded-[8px] border border-rule outline-none placeholder:text-muted focus:border-orange"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="A thought, a link, a small beginning…"
              aria-label="New note"
            />}
            {captureMode === "url" && <input
              autoFocus
              type="text"
              className="w-full h-10 p-[0_11px] text-[13px] text-ink bg-paper rounded-[8px] border border-rule outline-none placeholder:text-muted focus:border-orange"
              inputMode="url"
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder="Paste a link to save and read later (example.com works too)…"
              aria-label="URL to save"
            />}
            {captureMode === "quote" && <div className="quote-capture-fields grid min-w-[260px] flex-1 gap-2">
              <textarea
                autoFocus
                className="max-h-[120px] min-h-[58px] w-full p-[10px_12px] text-[13px] leading-[1.4] text-ink bg-[#202820] rounded-[8px] border border-[#3f4a3f] outline-none resize-y focus:border-green"
                value={quoteText}
                onChange={(event) => onQuoteTextChange(event.target.value)}
                placeholder="“The mind is a place with weather…”"
                aria-label="Quote text"
                rows={3}
                maxLength={2000}
              />
              <div className="quote-capture-row flex gap-2">
                <input
                  className="min-w-0 h-10 flex-1 p-[9px_10px] text-xs text-ink bg-[#202820] rounded-[8px] border border-[#3f4a3f] outline-none placeholder:text-muted focus:border-green"
                  value={quoteAttribution}
                  onChange={(event) => onQuoteAttributionChange(event.target.value)}
                  placeholder="Attribution"
                  aria-label="Quote attribution"
                  maxLength={240}
                />
                <input
                  type="text"
                  className="min-w-0 h-10 flex-1 p-[9px_10px] text-xs text-ink bg-[#202820] rounded-[8px] border border-[#3f4a3f] outline-none placeholder:text-muted focus:border-green"
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
                className="visually-hidden absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0_0_0_0)] [clip-path:inset(50%)]"
                accept="image/*,application/pdf,video/*"
                onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
              />
              <button type="button" className="file-picker h-10 min-w-0 w-full cursor-pointer overflow-hidden whitespace-nowrap p-[0_11px] text-left text-[13px] text-muted bg-paper rounded-[8px] border border-rule [text-overflow:ellipsis] hover:border-[#5a5750] hover:text-ink" onClick={() => fileInputRef.current?.click()}>
                {file ? file.name : "Choose an image, PDF, or video"}
              </button>
            </>}
            <div className="capture-editor-actions flex justify-end gap-2">
              <button className="capture-cancel cursor-pointer p-[7px_11px] text-xs text-muted bg-transparent rounded-[7px] border border-rule transition-[transform,color,border-color] duration-[.16s] ease-[cubic-bezier(.23,1,.32,1)] hover:border-[#5a5750] hover:text-ink active:scale-[.96]" type="button" onClick={onCloseMode}>Back</button>
              <button className="capture-save cursor-pointer p-[8px_12px] text-xs font-semibold text-[#14201a] bg-green rounded-[6px] border-0 transition-[transform,background] duration-[.16s] ease-[cubic-bezier(.23,1,.32,1)] hover:not-disabled:bg-[#91b19d] active:not-disabled:scale-[.96] disabled:cursor-wait disabled:opacity-65" type="submit" disabled={isCapturing}>{isCapturing ? "Saving…" : "Save to library"}</button>
            </div>
            </motion.form>
          )}
        </AnimatePresence>

        {error && <p className="capture-error flex-[0_0_auto] mt-3 text-xs text-[#d07055]" role="alert">Couldn’t save this yet: {error}</p>}
        </motion.section>
      </motion.div>
    )}
  </AnimatePresence>
  );
}
