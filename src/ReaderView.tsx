import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import "./reader.css";
import { AppIcon } from "./components/AppIcon";

export type ReaderOrigin = { x: number; y: number };

export type ReaderItem = {
  id: string | number;
  title: string;
  author?: string;
  publishedDate?: string;
  savedDate: string;
  sourceLabel: string;
  sourceUrl: string;
  html: string;
};

export const READER_FONT_SETS = [
  { id: "quiet-classic", label: "Quiet Classic" },
  { id: "bookplate", label: "Bookplate" },
  { id: "print-shop", label: "Print Shop" },
  { id: "bold-editorial", label: "Bold Editorial" },
  { id: "statement", label: "Statement" },
  { id: "web-standard", label: "Web Standard" },
  { id: "casual-web", label: "Casual Web" },
] as const;

export type ReaderFontSet = (typeof READER_FONT_SETS)[number]["id"];

const FONT_SET_STORAGE_KEY = "reader-font-set";

function loadFontSet(): ReaderFontSet {
  try {
    const stored = localStorage.getItem(FONT_SET_STORAGE_KEY);
    if (stored && READER_FONT_SETS.some((set) => set.id === stored)) return stored as ReaderFontSet;
  } catch {
    return "quiet-classic";
  }
  return "quiet-classic";
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}

type ReaderViewProps = {
  item: ReaderItem;
  origin: ReaderOrigin;
  onRequestClose: () => void;
};

export function ReaderView({ item, origin, onRequestClose }: ReaderViewProps) {
  const [fontSet, setFontSet] = useState<ReaderFontSet>(loadFontSet);
  const shouldReduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    try {
      localStorage.setItem(FONT_SET_STORAGE_KEY, fontSet);
    } catch {
      return;
    }
  }, [fontSet]);

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

  const bylineParts = [item.author, item.publishedDate ?? item.savedDate].filter(Boolean);
  const host = hostnameOf(item.sourceUrl);

  const readerOrigin = "var(--reader-origin-x) var(--reader-origin-y)";
  const readerOpenClip = `circle(150% at ${readerOrigin})`;
  const readerClosedClip = `circle(0% at ${readerOrigin})`;

  return (
    <motion.div
      className={`reader-overlay reader-font-${fontSet}`}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      style={{ "--reader-origin-x": `${origin.x}px`, "--reader-origin-y": `${origin.y}px` } as React.CSSProperties}
      initial={{ opacity: 0, clipPath: shouldReduceMotion ? readerOpenClip : readerClosedClip }}
      animate={{ opacity: 1, clipPath: readerOpenClip }}
      exit={{ opacity: 0, clipPath: shouldReduceMotion ? readerOpenClip : readerClosedClip }}
      transition={{ duration: shouldReduceMotion ? 0.18 : 0.55, ease: [0.4, 0, 0.2, 1] }}
    >
      <button type="button" className="reader-close" onClick={onRequestClose} title="Close reader" aria-label="Close reader (Escape)">
        <span className="reader-close-esc">Esc</span>
        <AppIcon name="x" size={16} />
      </button>

      <div className="reader-scroll">
        <article className="reader-page">
          <header className="reader-header">
            <h1>{item.title}</h1>
            {bylineParts.length > 0 && (
              <p className="reader-byline">
                {bylineParts.map((part, index) => (
                  <span key={index}>{part}</span>
                ))}
              </p>
            )}
          </header>

          <div className="reader-content" dangerouslySetInnerHTML={{ __html: item.html }} />

          <footer className="reader-footer">
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
              Continue reading at {host} <AppIcon name="arrowUpRight" size={15} />
            </a>
          </footer>
        </article>
      </div>

      <div className="reader-font-picker" aria-label="Reader typography">
        <label>
          <span>Typeface</span>
          <select value={fontSet} onChange={(event) => setFontSet(event.target.value as ReaderFontSet)}>
            {READER_FONT_SETS.map((set) => (
              <option key={set.id} value={set.id}>
                {set.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </motion.div>
  );
}
