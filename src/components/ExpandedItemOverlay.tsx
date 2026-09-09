import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { AlertCircle, BookOpen, Check, Copy, ExternalLink, FileText, LoaderCircle, RotateCw, Sparkles, X } from "lucide-react";
import type { LibraryItem } from "../App";
import { isTauriRuntime } from "../lib/libraryApi";
import type { ReaderOrigin } from "../ReaderView";
import { KindIcon, PostArtwork, XPostEmbed, DetailVideoMedia, mediaAspectRatioFor } from "./ItemMedia";

export type ExpandedOverlayActions = {
  onClose: () => void;
  onOpenPdf: (item: LibraryItem) => void;
  onOpenReader: (item: LibraryItem, origin: ReaderOrigin) => void;
  onFindSimilar: (item: LibraryItem) => void;
  onRetryJob: (jobId: string) => void | Promise<void>;
  isFindingSimilar: boolean;
};

type OverlayAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
};

function clickOrigin(event: React.MouseEvent<HTMLElement>): ReaderOrigin {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// The overlay keeps two triage actions in view: a primary (read / play / open)
// and secondary (open original / find similar). Everything after the first
// entry renders in the secondary slot.
function triageActions(item: LibraryItem, actions: ExpandedOverlayActions): OverlayAction[] {
  const list: OverlayAction[] = [];
  const openOriginal: OverlayAction = {
    key: "open-original",
    label: "Open original",
    icon: <ExternalLink size={15} />,
    onClick: () => item.sourceUrl && window.open(item.sourceUrl, "_blank", "noopener,noreferrer"),
    disabled: !item.sourceUrl,
  };

  if (item.kind === "PDF" && item.fileUrl) {
    list.push({ key: "open-pdf", label: "Open PDF", icon: <FileText size={15} />, onClick: () => actions.onOpenPdf(item) });
  }
  if (item.kind === "Article" && item.articleHtml) {
    list.push({
      key: "read",
      label: "Read",
      icon: <BookOpen size={15} />,
      onClick: (event) => actions.onOpenReader(item, clickOrigin(event)),
    });
  }
  if (list.length === 0 || item.sourceUrl) list.push(openOriginal);
  if (item.kind === "Image" && isTauriRuntime()) {
    list.push({
      key: "find-similar",
      label: actions.isFindingSimilar ? "Finding similar…" : "Find similar",
      icon: <Sparkles size={15} />,
      onClick: () => actions.onFindSimilar(item),
      disabled: actions.isFindingSimilar,
    });
  }
  if (item.kind === "Article" && !item.articleHtml && item.sourceUrl) {
    list.push({
      key: "read-unavailable",
      label: "Read",
      icon: <BookOpen size={15} />,
      onClick: () => {},
      disabled: true,
      title: "No saved article text",
    });
  }
  return list;
}

function OverlayMedia({ item }: { item: LibraryItem }) {
  if (item.social?.provider === "x") {
    return (
      <div className="expanded-overlay-media detail-x-post">
        <XPostEmbed
          social={item.social}
          fallback={item.post ? <PostArtwork post={item.post} /> : <div className="detail-art ink">Post preview unavailable.</div>}
        />
      </div>
    );
  }

  if (item.kind === "Video") {
    return (
      <div className="expanded-overlay-media">
        <DetailVideoMedia item={item} />
      </div>
    );
  }

  if (item.image) {
    return (
      <div className="expanded-overlay-media">
        <img
          src={item.image}
          alt={item.imageAlt ?? item.title}
          className="detail-image"
          style={{ aspectRatio: String(mediaAspectRatioFor(item)) } as CSSProperties}
        />
      </div>
    );
  }

  if (item.kind === "Quote") {
    return (
      <div className="expanded-overlay-media">
        <div className="detail-art detail-quote-art paper-yellow">
          <span className="detail-quote-mark">“</span>
          <span>{item.kind}</span>
        </div>
      </div>
    );
  }

  if (item.kind === "Post" && item.post) {
    return (
      <div className="expanded-overlay-media">
        <PostArtwork post={item.post} />
      </div>
    );
  }

  return (
    <div className="expanded-overlay-media">
      <div className={`detail-art ${item.accent ?? "ink"}`}>
        <KindIcon kind={item.kind} />
        <span>{item.kind}</span>
      </div>
    </div>
  );
}

export function ExpandedItemOverlay({ item, actions }: { item: LibraryItem; actions: ExpandedOverlayActions }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const itemIdRef = useRef(item.id);
  const copyTimerRef = useRef<number | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useLayoutEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    itemIdRef.current = item.id;
  }, [item.id]);

  // On close, hand focus back to the source card while it is still mounted.
  // Skipping the restore when focus already moved elsewhere (nav, search)
  // avoids yanking it back out of whatever the user clicked.
  useEffect(() => () => {
    const focusOwner = document.activeElement;
    const overlayHasFocus = focusOwner instanceof HTMLElement && (dialogRef.current?.contains(focusOwner) ?? false);
    if (!overlayHasFocus && focusOwner !== document.body) return;
    const card = document.querySelector<HTMLElement>(
      `.library-card[data-library-item-id="${CSS.escape(String(itemIdRef.current))}"]`,
    );
    card?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      actions.onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [actions]);

  // Modeless close: clicks on empty library space dismiss the overlay, while
  // clicks on cards fall through to the card's own handler, which switches
  // the overlay to that item.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dialogRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".library-card")) return;
      actions.onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [actions]);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  const triage = triageActions(item, actions);

  function copySourceLink() {
    if (!item.sourceUrl) return;
    void navigator.clipboard.writeText(item.sourceUrl).then(() => {
      setLinkCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  return (
    <motion.div
      className="expanded-overlay-layer"
      initial={{ opacity: 0, transform: "scale(0.97)" }}
      animate={{ opacity: 1, transform: "scale(1)" }}
      exit={{ opacity: 0, transform: "scale(0.98)" }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
    >
      <section ref={dialogRef} className="expanded-overlay" role="dialog" aria-modal={false} aria-label={item.title}>
        <header className="expanded-overlay-header">
          <span className="expanded-overlay-kicker"><KindIcon kind={item.kind} />{item.kind}</span>
          <button
            type="button"
            ref={closeButtonRef}
            className="expanded-overlay-close"
            onClick={actions.onClose}
            aria-label="Close details"
          >
            <X size={16} />
          </button>
        </header>

        <OverlayMedia item={item} />

        <div className="expanded-overlay-body">
          <div className="card-kicker"><span><KindIcon kind={item.kind} />{item.kind}</span><span>{item.date}</span></div>
          {item.kind === "Quote" ? (
            <>
              <blockquote className="detail-quote">“{item.title}”</blockquote>
              {item.description && <p className="detail-attribution">— {item.description.replace(/^—\s*/u, "")}</p>}
            </>
          ) : (
            <>
              <h2 className="expanded-overlay-title">{item.title}</h2>
              {item.description && <p className="expanded-overlay-description">{item.description}</p>}
            </>
          )}
          {item.processing?.active && (
            <div className="detail-processing" role="status">
              <LoaderCircle size={14} />
              <span>{item.processing.message ?? "Processing"}</span>
              {item.processing.progressTotal != null && <span>{item.processing.progressCurrent}/{item.processing.progressTotal}</span>}
            </div>
          )}
          {item.processing?.failedJob && (
            <div className="detail-processing failed" role="alert">
              <AlertCircle size={14} />
              <span>{item.processing.failedJob.errorMessage ?? "Processing failed"}</span>
              <button type="button" className="retry-button" onClick={() => void actions.onRetryJob(item.processing?.failedJob?.id ?? "")}>
                <RotateCw size={12} /> Try again
              </button>
            </div>
          )}
          <div className="detail-source"><span>Source</span><strong>{item.source}</strong></div>
          <div className="tag-row">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>

          <div className="expanded-overlay-actions">
            {triage.map((action, index) => (
              <button
                type="button"
                key={action.key}
                className={index === 0 ? "overlay-action-primary" : "overlay-action-secondary"}
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.title}
              >
                {action.icon} {action.label}
              </button>
            ))}
          </div>

          {item.sourceUrl && (
            <div className="expanded-overlay-utility">
              <button type="button" className="expanded-overlay-utility-action" onClick={copySourceLink} aria-label="Copy link to original">
                {linkCopied ? <Check size={13} /> : <Copy size={13} />} {linkCopied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}

          {/* Insertion point for related items (overlay PR 3); renders nothing until then. */}
          <div className="expanded-overlay-related" hidden />
        </div>
      </section>
    </motion.div>
  );
}
