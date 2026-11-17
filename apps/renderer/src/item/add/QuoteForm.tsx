import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { Button, IconButton } from "@inkling/ui";
import { color, font, itemColor, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import { type KeyboardEvent, useRef, useState } from "react";
import { looksLikeUrl, withScheme } from "../../capture/capture.ts";
import { controlsOnRight, platform } from "../../desktop.ts";
import { ScrollArea } from "../../reader/ScrollArea.tsx";
import { confirm } from "../../shell/confirm.ts";
import { drafts } from "./drafts.ts";
import { notAddress, useAddPage } from "./useAddPage.ts";

const saveKeys = `${platform === "darwin" ? "⌘" : "Ctrl"} ↵ saves · Esc discards`;
const empty = { body: "", attribution: "", sourceUrl: "" };

/** Add > Quote, laid out as the note page is: the quote, who said it, and where it is from. */
export function QuoteForm() {
  const [quote, setQuote] = useState(drafts.quote);
  const [scrolled, setScrolled] = useState(false);
  const bodyField = useRef<HTMLTextAreaElement>(null);
  const dirty = Object.values(quote).some((value) => value.trim() !== "");
  const canSave = quote.body.trim() !== "";

  // Escape with text asks first, as the note page does; Back and the sidebar keep the draft.
  const page = useAddPage({ onEscape: () => (dirty ? void discard() : page.leave()) });
  async function discard() {
    if (
      !(await confirm({
        message: "Discard this quote?",
        confirmLabel: "Discard",
        destructive: true,
      }))
    )
      return;
    drafts.quote = empty;
    setQuote(empty);
    page.reject(null);
    bodyField.current?.focus();
  }

  const update = (field: keyof typeof quote) => (value: string) => {
    const next = { ...quote, [field]: value };
    drafts.quote = next;
    setQuote(next);
  };
  const submit = () => {
    if (!canSave || page.saving) return;
    const sourceUrl = quote.sourceUrl.trim();
    if (sourceUrl && !looksLikeUrl(sourceUrl)) return page.reject(`for the source, ${notAddress}`);
    page
      .save((client) =>
        client.createQuote({
          body: quote.body.trim(),
          attribution: quote.attribution.trim() || undefined,
          sourceUrl: sourceUrl ? withScheme(sourceUrl) : undefined,
          metadata: { captureSource: "quick quote" },
        }),
      )
      .then(
        (saved) => {
          if (saved) drafts.quote = empty;
        },
        // The page shows the library's message.
        () => undefined,
      );
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const single = event.target instanceof HTMLInputElement;
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey || single)) {
      event.preventDefault();
      submit();
    }
  };
  const words = quote.body.trim() ? quote.body.trim().split(/\s+/u).length : 0;

  return (
    <div data-escape-scope {...stylex.props(styles.page)}>
      <div
        {...stylex.props(
          styles.bar,
          scrolled && styles.barScrolled,
          controlsOnRight && styles.clearControls,
        )}
      >
        <IconButton
          label="Back"
          icon={<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />}
          onClick={page.leave}
        />
      </div>
      <ScrollArea
        trackStyle={styles.track}
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
      >
        <div {...stylex.props(styles.column)}>
          <h1 {...stylex.props(styles.title)}>New quote</h1>
          <p {...stylex.props(styles.meta)}>
            Quote
            {words > 0 && (
              <>
                <span aria-hidden="true" {...stylex.props(styles.dot)} />
                {words === 1 ? "1 word" : `${words} words`}
              </>
            )}
          </p>
          <textarea
            ref={bodyField}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the page exists to write this quote.
            autoFocus
            aria-label="Quote text"
            placeholder="“The mind is a place with weather…”"
            maxLength={2000}
            rows={1}
            value={quote.body}
            onChange={(event) => update("body")(event.target.value)}
            onKeyDown={onKeyDown}
            {...stylex.props(styles.body)}
          />
          <label {...stylex.props(styles.line, styles.by)}>
            <span aria-hidden="true" {...stylex.props(styles.lead)}>
              —
            </span>
            <input
              aria-label="Attribution"
              placeholder="Who said it"
              maxLength={240}
              value={quote.attribution}
              onChange={(event) => update("attribution")(event.target.value)}
              onKeyDown={onKeyDown}
              {...stylex.props(styles.field, styles.byField)}
            />
          </label>
          <label {...stylex.props(styles.line, styles.from)}>
            <span aria-hidden="true" {...stylex.props(styles.lead)}>
              from
            </span>
            <input
              aria-label="Source URL"
              placeholder="a link, if there is one"
              inputMode="url"
              value={quote.sourceUrl}
              onChange={(event) => update("sourceUrl")(event.target.value)}
              onKeyDown={onKeyDown}
              {...stylex.props(styles.field, styles.fromField)}
            />
          </label>
        </div>
      </ScrollArea>
      {(dirty || page.error) && (
        <p
          role={page.error ? "alert" : "status"}
          {...stylex.props(styles.status, page.error !== null && styles.error)}
        >
          {page.error ? (
            `Couldn’t save this yet: ${page.error}`
          ) : (
            <>
              <span aria-hidden="true" {...stylex.props(styles.editedDot)} />
              New quote<span {...stylex.props(styles.keys)}>{saveKeys}</span>
            </>
          )}
        </p>
      )}
      {dirty && (
        <div {...stylex.props(styles.actions)}>
          <Button style={styles.pill} onClick={() => void discard()}>
            Discard
          </Button>
          <Button
            variant="primary"
            style={styles.pill}
            disabled={page.saving || !canSave}
            onClick={submit}
          >
            {page.saving ? "Saving…" : "Save to library"}
          </Button>
        </div>
      )}
    </div>
  );
}

const fade = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const rise = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(14px)" },
  to: { opacity: 1, transform: "none" },
});

const styles = stylex.create({
  page: {
    position: "absolute",
    inset: 0,
    zIndex: 10,
    overflow: "hidden",
    backgroundColor: color.frame,
    color: color.ink,
    animationName: fade,
    animationDuration: motion.layout,
    animationTimingFunction: motion.standard,
  },
  bar: {
    position: "absolute",
    top: 0,
    insetInline: 0,
    zIndex: 3,
    display: "flex",
    alignItems: "center",
    height: "56px",
    paddingInline: "clamp(10px, 2vw, 20px)",
  },
  barScrolled: { backgroundImage: `linear-gradient(${color.frame} 70%, transparent)` },
  // The window's own buttons fill this corner on Windows and Linux.
  clearControls: { paddingRight: "118px" },
  track: { top: "58px" },
  column: {
    display: "flex",
    flexDirection: "column",
    maxWidth: "640px",
    marginInline: "auto",
    paddingTop: "clamp(76px, 11vh, 104px)",
    paddingInline: "clamp(20px, 5vw, 44px)",
    // Clear of the status and buttons that float over the end of the page.
    paddingBottom: "140px",
    animationName: { default: rise, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "0.6s",
    animationTimingFunction: "cubic-bezier(0.2, 0.75, 0.25, 1)",
    animationFillMode: "both",
  },
  title: {
    margin: 0,
    fontFamily: font.display,
    fontSize: "clamp(28px, 3.4vw, 34px)",
    fontWeight: 600,
    lineHeight: 1.18,
    letterSpacing: "-0.02em",
    color: color.faint,
  },
  meta: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    marginTop: space.s3,
    marginBottom: 0,
    fontFamily: font.body,
    fontSize: "13px",
    color: color.muted,
  },
  dot: { width: "3px", height: "3px", borderRadius: radius.round, backgroundColor: color.faint },
  body: {
    boxSizing: "border-box",
    width: "100%",
    marginTop: "30px",
    marginInline: 0,
    marginBottom: 0,
    paddingBlock: "2px",
    paddingLeft: "20px",
    paddingRight: 0,
    borderWidth: 0,
    borderLeftWidth: "2px",
    borderLeftStyle: "solid",
    borderLeftColor: itemColor.quoteRule,
    outline: "none",
    resize: "none",
    fieldSizing: "content",
    backgroundColor: "transparent",
    fontFamily: font.quote,
    fontStyle: "italic",
    fontSize: "20px",
    lineHeight: 1.6,
    color: itemColor.writingInk,
    caretColor: color.accentStrong,
    "::placeholder": { color: color.faint },
    "::selection": { backgroundColor: color.selection },
  },
  line: { display: "flex", alignItems: "baseline", gap: space.s2, paddingLeft: "22px" },
  by: { marginTop: "18px", fontFamily: font.display, fontSize: "15px", color: color.muted },
  from: { marginTop: space.s2, fontFamily: font.mono, fontSize: "12.5px", color: color.faint },
  lead: { flexShrink: 0 },
  field: {
    flexGrow: 1,
    minWidth: 0,
    padding: 0,
    borderWidth: 0,
    outline: "none",
    backgroundColor: "transparent",
    font: "inherit",
    caretColor: color.accentStrong,
    "::placeholder": { color: color.faint },
    "::selection": { backgroundColor: color.selection },
  },
  byField: { color: color.inkSoft },
  fromField: { color: color.muted },
  status: {
    position: "absolute",
    left: "28px",
    bottom: "22px",
    zIndex: 4,
    display: "flex",
    alignItems: "center",
    gap: "7px",
    margin: 0,
    fontFamily: font.mono,
    fontSize: "12px",
    color: color.faint,
  },
  error: { fontFamily: font.body, fontSize: text.sm, color: color.danger },
  editedDot: {
    width: "6px",
    height: "6px",
    borderRadius: radius.round,
    backgroundColor: color.accentStrong,
  },
  keys: { marginLeft: "7px" },
  actions: {
    position: "absolute",
    right: "24px",
    bottom: "18px",
    zIndex: 4,
    display: "flex",
    gap: "6px",
  },
  pill: { height: "30px", paddingInline: "13px", borderRadius: radius.round, fontSize: "12.5px" },
});
