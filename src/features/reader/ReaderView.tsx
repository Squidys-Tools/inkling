import { useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { hostnameForUrl } from "../hostname";
import { isWebUrl } from "../../lib/ingestion/url";
import { purifyHtml } from "../../lib/purifyHtml";
import "./reader.css";
import "./readerContent.css";
import { ReaderFontPicker, useReaderFontSet } from "./ReaderFontPicker";

export type ReaderOrigin = { x: number; y: number };

export type ReaderItem = {
  id: string | number;
  title: string;
  author?: string;
  publishedDate?: string;
  savedDate: string;
  sourceUrl: string;
  html: string;
};

type ReaderViewProps = {
  item: ReaderItem;
  origin: ReaderOrigin;
  onRequestClose: () => void;
};

export function ReaderView({ item, origin, onRequestClose }: ReaderViewProps) {
  const [fontSet, setFontSet] = useReaderFontSet();
  const shouldReduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onRequestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onRequestClose]);

  const html = useMemo(
    () => purifyHtml(window, item.html, item.sourceUrl),
    [item.html, item.sourceUrl],
  );
  const bylineParts = [item.author, item.publishedDate ?? item.savedDate].filter(Boolean);
  const host = hostnameForUrl(item.sourceUrl) ?? item.sourceUrl;

  const readerOrigin = "var(--reader-origin-x) var(--reader-origin-y)";
  const readerOpenClip = `circle(150% at ${readerOrigin})`;
  const readerClosedClip = `circle(0% at ${readerOrigin})`;

  return (
    <motion.div
      className={`reader-overlay reader-font-${fontSet}`}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      style={
        {
          "--reader-origin-x": `${origin.x}px`,
          "--reader-origin-y": `${origin.y}px`,
        } as React.CSSProperties
      }
      initial={{ opacity: 0, clipPath: shouldReduceMotion ? readerOpenClip : readerClosedClip }}
      animate={{ opacity: 1, clipPath: readerOpenClip }}
      exit={{ opacity: 0, clipPath: shouldReduceMotion ? readerOpenClip : readerClosedClip }}
      transition={{ duration: shouldReduceMotion ? 0.18 : 0.55, ease: [0.4, 0, 0.2, 1] }}
    >
      <button
        type="button"
        className="reader-close"
        onClick={onRequestClose}
        data-tooltip="Close reader"
        aria-label="Close reader (Escape)"
      >
        <span className="reader-close-esc">Esc</span>
        <HugeiconsIcon icon={Cancel01Icon} size={16} />
      </button>

      <div className="reader-scroll">
        <article className="reader-page">
          <header className="reader-header">
            <h1>{item.title}</h1>
            {bylineParts.length > 0 && (
              <p className="reader-byline">
                {bylineParts.map((part, index) => (
                  // oxlint-disable-next-line react/no-array-index-key -- bylineParts is a stable split of one string; it never reorders.
                  <span key={index}>{part}</span>
                ))}
              </p>
            )}
          </header>

          <div className="reader-content" dangerouslySetInnerHTML={{ __html: html }} />

          {/* The source link becomes an href, so a stored javascript: or data: value must not reach it. */}
          {isWebUrl(item.sourceUrl) && (
            <footer className="reader-footer">
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                Continue reading at {host} <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
              </a>
            </footer>
          )}
        </article>
      </div>

      <ReaderFontPicker value={fontSet} onChange={setFontSet} />
    </motion.div>
  );
}
