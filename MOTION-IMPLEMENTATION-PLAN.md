# Motion (Framer Motion) Implementation Plan

**Library:** `motion` (already installed — `npm install motion`)
**Purpose:** Add exit animations to conditionally-rendered overlays (currently vanishing instantly on close)

---

## Step 1 — Add import

```tsx
// App.tsx, top of file alongside existing React imports
import { AnimatePresence, motion } from "motion/react";
```

---

## Step 2 — Capture modal

Wrap the `{isAdding && (...)}` block (line ~1613) in `AnimatePresence` and replace the plain `<div className="capture-modal-backdrop">` with `<motion.div>`:

```tsx
<AnimatePresence>
  {isAdding && (
    <motion.div
      key="capture-modal"
      className="capture-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onMouseDown={(event) => event.target === event.currentTarget && closeCaptureModal()}
    >
      <motion.section
        className="capture-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-modal-title"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {/* ...existing modal content unchanged... */}
      </motion.section>
    </motion.div>
  )}
</AnimatePresence>
```

Remove from App.css (line 90):
- The `animation: modal-in .24s ease both;` declaration from `.capture-modal`
- The `@keyframes modal-in` rule (line 148)

---

## Step 3 — Item inspector

Wrap the `{selectedItem && (...)}` block (line ~1845) in `AnimatePresence` and replace `<aside className="item-inspector">` with `<motion.aside>`:

```tsx
<AnimatePresence>
  {selectedItem && (
    <motion.aside
      key="inspector"
      className="item-inspector"
      aria-label="Selected item"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {/* ...existing inspector content unchanged... */}
    </motion.aside>
  )}
</AnimatePresence>
```

Remove from App.css (line 133):
- The `animation: inspector-in .28s ease both;` declaration from `.item-inspector`
- The `@keyframes inspector-in` rule (line 148)

---

## Step 4 — PDF viewer

Wrap the `{pdfViewerItem?.fileUrl && (...)}` block (line ~1930) in `AnimatePresence` and replace the `<PdfViewer>` wrapper. Since `PdfViewer` is its own component, wrap it in a `motion.div`:

```tsx
<AnimatePresence>
  {pdfViewerItem?.fileUrl && (
    <motion.div
      key="pdf-viewer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <PdfViewer
        url={pdfViewerItem.fileUrl}
        title={pdfViewerItem.title}
        onClose={() => setPdfViewerItem(null)}
      />
    </motion.div>
  )}
</AnimatePresence>
```

Remove from App.css (line 175):
- The `animation: settle .18s ease;` declaration from `.pdf-viewer-overlay`
- The existing `@keyframes settle` rule (line 148) — only if reader view no longer uses it (check reader.css first)

---

## Step 5 — Reader view

In `ReaderView.tsx`:

1. Replace the `closing` state + `closeTimer` hack with `AnimatePresence`:

```tsx
// Remove:
const [closing, setClosing] = useState(false);
const closeTimer = useRef<number | null>(null);

// Remove the handleClose/setTimeout logic and the cleanup effect

// In the return, wrap with AnimatePresence and use motion.div:
// The component itself becomes the motion target — no wrapper needed

import { AnimatePresence, motion } from "motion/react";

// Replace the return block:
return (
  <AnimatePresence>
    <motion.div
      className={`reader-overlay reader-font-${fontSet}`}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      style={{ "--reader-origin-x": `${origin.x}px`, "--reader-origin-y": `${origin.y}px` } as React.CSSProperties}
      initial={{ opacity: 0, clipPath: "circle(0% at var(--reader-origin-x) var(--reader-origin-y))" }}
      animate={{ opacity: 1, clipPath: "circle(150% at var(--reader-origin-x) var(--reader-origin-y))" }}
      exit={{ opacity: 0, clipPath: "circle(0% at var(--reader-origin-x) var(--reader-origin-y))" }}
      transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* ...existing content unchanged... */}
    </motion.div>
  </AnimatePresence>
);
```

2. Update `onRequestClose` to just call the prop directly — `AnimatePresence` handles unmounting after exit:

```tsx
// Change the close button onClick from handleClose to onRequestClose
// The Escape key handler in the useEffect also just calls onRequestClose directly
```

3. Remove `closeTimer` cleanup effect (line 74-78)

4. In `reader.css`: remove `.reader-overlay.closing` rules and `@keyframes reader-clip-out` (the reverse circle animation) since `AnimatePresence` exit handles this now.

---

## Step 6 — CSS cleanup

In `App.css`, remove these now-redundant declarations:

| Selector | Remove | Line |
|----------|--------|------|
| `.capture-modal` | `animation: modal-in .24s ease both;` | 90 |
| `.item-inspector` | `animation: inspector-in .28s ease both;` | 133 |
| `.pdf-viewer-overlay` | `animation: settle .18s ease;` | 175 |
| `@keyframes modal-in` | entire rule | 148 |
| `@keyframes inspector-in` | entire rule | 148 |

In `reader.css`, remove:

| Selector | Remove |
|----------|--------|
| `.reader-overlay.closing` | entire rule |
| `@keyframes reader-clip-out` | entire rule |

Keep these (still used elsewhere):
- `@keyframes card-in` — cards still use it
- `@keyframes settle` — quick-capture still uses it (line 102)
- `@keyframes spin` — loader spinners still use it

---

## Summary of overlays animated

| Overlay | Enter | Exit | Duration |
|---------|-------|------|----------|
| Capture modal backdrop | fade in | fade out | 0.2s |
| Capture modal card | fade + slide up + scale | reverse | 0.2s |
| Inspector panel | fade + slide from right | reverse | 0.25s |
| PDF viewer overlay | fade in | fade out | 0.18s |
| Reader view | clip-path circle expand | circle collapse | 0.55s |
