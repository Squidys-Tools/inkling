import * as stylex from "@stylexjs/stylex";
import { itemColor } from "@inkling/ui/tokens.stylex";
import { useState } from "react";
import { reader } from "./readerTheme.stylex.ts";

const serif = "Georgia, serif";
const sans = "ui-sans-serif, system-ui, sans-serif";

// createTheme must be bound to a plain variable, so each set gets one.
const bookplate = stylex.createTheme(reader, {
  heading: `"EB Garamond", ${serif}`,
  body: `"Literata", ${serif}`,
  quote: `"Cormorant Garamond", ${serif}`,
  list: `"Vollkorn", ${serif}`,
  meta: `"EB Garamond", ${serif}`,
  headingTracking: "0",
  quoteBackground: itemColor.accentTint,
});

const printShop = stylex.createTheme(reader, {
  heading: `"Spectral", ${serif}`,
  body: `"PT Serif", ${serif}`,
  quote: `"Bitter", ${serif}`,
  list: `"Gelasio", ${serif}`,
  meta: `"Spectral", ${serif}`,
  headingWeight: "700",
  headingTracking: "-0.005em",
  bodySize: "18px",
});

const boldEditorial = stylex.createTheme(reader, {
  heading: `"Fraunces", ${serif}`,
  body: `"Bitter", ${serif}`,
  quote: `"Playfair Display", ${serif}`,
  list: `"Zilla Slab", ${serif}`,
  meta: `"Zilla Slab", ${serif}`,
  headingWeight: "700",
  headingTracking: "-0.015em",
  bodySize: "18px",
});

const statement = stylex.createTheme(reader, {
  heading: `"Space Grotesk", ${sans}`,
  body: `"Gelasio", ${serif}`,
  quote: `"Libre Baskerville", ${serif}`,
  list: `"IBM Plex Serif", ${serif}`,
  meta: `"Space Grotesk", ${sans}`,
  headingWeight: "700",
  headingTracking: "-0.02em",
  bodySize: "18px",
});

const webStandard = stylex.createTheme(reader, {
  heading: `"Inter", ${sans}`,
  body: `"Roboto", Arial, sans-serif`,
  quote: `"Arimo", Arial, sans-serif`,
  list: `"Noto Sans", Arial, sans-serif`,
  meta: `"Roboto", Arial, sans-serif`,
  headingWeight: "700",
  headingTracking: "-0.02em",
  bodySize: "17px",
  quoteBackground: itemColor.mutedTint,
});

const casualWeb = stylex.createTheme(reader, {
  heading: `"Nunito Sans", ${sans}`,
  body: `"Source Sans 3", ${sans}`,
  quote: `"Lora", ${serif}`,
  list: `"PT Sans", ${sans}`,
  meta: `"Source Sans 3", ${sans}`,
  headingWeight: "900",
  bodySize: "18px",
});

const themes = {
  // Quiet Classic is the variables' default.
  "quiet-classic": null,
  bookplate,
  "print-shop": printShop,
  "bold-editorial": boldEditorial,
  statement,
  "web-standard": webStandard,
  "casual-web": casualWeb,
};

export type FontSet = keyof typeof themes;

export const fontSets: readonly { id: FontSet; label: string }[] = [
  { id: "quiet-classic", label: "Quiet Classic" },
  { id: "bookplate", label: "Bookplate" },
  { id: "print-shop", label: "Print Shop" },
  { id: "bold-editorial", label: "Bold Editorial" },
  { id: "statement", label: "Statement" },
  { id: "web-standard", label: "Web Standard" },
  { id: "casual-web", label: "Casual Web" },
];

export const fontSetTheme = (set: FontSet) => themes[set];

/** Web Standard sets quotes upright at body size, like the sans pages it imitates. */
export const uprightQuotes = (set: FontSet) => set === "web-standard";

const storageKey = "reader-font-set";

const isFontSet = (value: string | null): value is FontSet =>
  fontSets.some((set) => set.id === value);

function storedFontSet(): FontSet {
  try {
    const stored = localStorage.getItem(storageKey);
    if (isFontSet(stored)) return stored;
  } catch {
    // Storage can be unavailable; the default set reads fine.
  }
  return "quiet-classic";
}

/** The reader's font set, kept across sessions. */
export function useFontSet() {
  const [fontSet, setFontSet] = useState(storedFontSet);
  const choose = (next: FontSet) => {
    setFontSet(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // The choice still holds for this session.
    }
  };
  return [fontSet, choose] as const;
}
