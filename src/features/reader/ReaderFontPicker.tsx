import { useEffect, useState } from "react";
import "./ReaderFontPicker.css";

const READER_FONT_SETS = [
  { id: "quiet-classic", label: "Quiet Classic" },
  { id: "bookplate", label: "Bookplate" },
  { id: "print-shop", label: "Print Shop" },
  { id: "bold-editorial", label: "Bold Editorial" },
  { id: "statement", label: "Statement" },
  { id: "web-standard", label: "Web Standard" },
  { id: "casual-web", label: "Casual Web" },
] as const;

type ReaderFontSet = (typeof READER_FONT_SETS)[number]["id"];

const FONT_SET_STORAGE_KEY = "reader-font-set";

function loadFontSet(): ReaderFontSet {
  try {
    const stored = localStorage.getItem(FONT_SET_STORAGE_KEY);
    if (stored && READER_FONT_SETS.some((set) => set.id === stored)) return stored as ReaderFontSet;
  } catch {}
  return "quiet-classic";
}

// The reader's font set, kept across sessions. ReaderFontPicker.css styles
// `.reader-font-<id>` for each.
export function useReaderFontSet() {
  const [fontSet, setFontSet] = useState<ReaderFontSet>(loadFontSet);
  useEffect(() => {
    try {
      localStorage.setItem(FONT_SET_STORAGE_KEY, fontSet);
    } catch {}
  }, [fontSet]);
  return [fontSet, setFontSet] as const;
}

export function ReaderFontPicker({
  value,
  onChange,
}: {
  value: ReaderFontSet;
  onChange: (fontSet: ReaderFontSet) => void;
}) {
  return (
    <div className="reader-font-picker">
      <label>
        <span>Typeface</span>
        <select value={value} onChange={(event) => onChange(event.target.value as ReaderFontSet)}>
          {READER_FONT_SETS.map((set) => (
            <option key={set.id} value={set.id}>
              {set.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
