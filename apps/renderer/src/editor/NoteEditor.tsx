import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import InformationCircleIcon from "@hugeicons/core-free-icons/InformationCircleIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { isWebUrl } from "@inkling/ingestion/url";
import { Button, IconButton } from "@inkling/ui";
import { color, font, itemColor, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import { EditorContent, useEditor } from "@tiptap/react";
import { useLayoutEffect, useRef, useState } from "react";
import { controlsOnRight, platform } from "../desktop.ts";
import { errorMessage } from "../library/errors.ts";
import { registerWritingFont } from "../reader/fonts.ts";
import { ScrollArea } from "../reader/ScrollArea.tsx";
import { confirm } from "../shell/confirm.ts";
import { LinkPopover } from "./LinkPopover.tsx";
import {
  applyBlock,
  SelectionBubble,
  SlashHint,
  SlashMenu,
  slashBlocks,
  useFormatState,
} from "./NoteFormatting.tsx";
import { type NoteClasses, noteChanges, noteExtensions } from "./noteMarkdown.ts";
import { normalizeNoteBody } from "./notes.ts";

// This module loads with the first editor, so the writing face loads with it.
registerWritingFont();

/** What the editor hands its page when the user saves. */
type NoteDraft = { markdown: string; text: string };

const saveKeys = `${platform === "darwin" ? "⌘" : "Ctrl"} ↵ saves · Esc discards`;

export const confirmDiscard = () =>
  confirm({
    message: "Discard your changes to this note?",
    confirmLabel: "Discard",
    destructive: true,
  });

/**
 * A note as a page: its title, then its text, edited in place. Nothing is
 * written until Save, and the page stays open after it; `onChange` reports each
 * edit so the page can keep or guard the draft.
 */
export function NoteEditor({
  title,
  meta = [],
  tags = [],
  initialMarkdown,
  placeholder,
  saveLabel,
  onSave,
  onCancel,
  onDetails,
  onChange,
}: {
  /** null for a note not saved yet. */
  title: string | null;
  meta?: readonly string[];
  tags?: readonly string[];
  initialMarkdown: string;
  placeholder: string;
  saveLabel: string;
  /** Rejects with the library's message, which the editor shows. */
  onSave: (draft: NoteDraft) => Promise<void>;
  onCancel: () => void;
  onDetails?: () => void;
  /** `changed` compares with the last saved text as the editor writes it, so undoing every edit reads as unchanged. */
  onChange?: (markdown: string, changed: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [origin, setOrigin] = useState<HTMLDivElement | null>(null);
  const [slashCursor, setSlashCursor] = useState({ key: "", index: 0 });
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [changes] = useState(noteChanges);
  // The editor's key handler is fixed when it is created; this follows each render.
  const keys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const editor = useEditor({
    extensions,
    content: initialMarkdown,
    contentType: "markdown",
    autofocus: "end",
    editorProps: {
      attributes: {
        class: className(styles.content),
        role: "textbox",
        "aria-label": "Note",
        "aria-multiline": "true",
      },
      handleKeyDown: (_view, event) => keys.current(event),
    },
    onUpdate: (event) => {
      const { markdown, changed } = changes.update(event);
      setDirty(changed);
      onChange?.(markdown, changed);
    },
  });
  const state = useFormatState(editor);

  const slash = state.slash && state.slash.from !== dismissed ? state.slash : null;
  if (!state.slash && dismissed !== null) setDismissed(null);
  const options = slash ? slashBlocks(slash.query) : [];
  const slashKey = slash ? `${slash.from}:${slash.query}` : "";
  const active = slashCursor.key === slashKey ? slashCursor.index : 0;
  const menuOpen = slash !== null && options.length > 0;

  async function save() {
    if (saving) return;
    const markdown = normalizeNoteBody(editor.getMarkdown());
    if (!markdown) {
      setError("A note needs some text before it can be saved.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ markdown, text: editor.getText().trim() });
      // Typing that landed during the save stays unsaved.
      changes.save(markdown);
      setDirty(normalizeNoteBody(editor.getMarkdown()) !== markdown);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function discard() {
    if (!dirty || !(await confirmDiscard())) return;
    editor.commands.setContent(changes.opening() ?? initialMarkdown, {
      contentType: "markdown",
      emitUpdate: true,
    });
    editor.commands.focus("end");
    setError(null);
  }

  const onKey = (event: KeyboardEvent) => {
    if (menuOpen && slash) {
      const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
      if (step !== 0) {
        setSlashCursor({ key: slashKey, index: (active + step + options.length) % options.length });
        return true;
      }
      const picked = options[active];
      if ((event.key === "Enter" || event.key === "Tab") && picked) {
        applyBlock(editor, slash, picked);
        return true;
      }
      if (event.key === "Escape") {
        setDismissed(slash.from);
        return true;
      }
    }
    // An Escape typed in the editor does not reach the page's window listener, so it is
    // handled here, and stops so the confirm it opens does not see it and close again.
    if (event.key === "Escape") {
      event.stopPropagation();
      if (dirty) void discard();
      else onCancel();
      return true;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      void save();
      return true;
    }
    return false;
  };

  useLayoutEffect(() => {
    keys.current = onKey;
  });

  const applyLink = () => {
    const href = (linkDraft ?? "").trim();
    // The link opens in the user's browser, so `javascript:` and data URLs never reach the Markdown.
    if (!isWebUrl(href)) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkDraft(null);
  };
  const metaLine = [...meta, ...(state.words > 0 ? [`${state.words} words`] : [])];

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
          onClick={onCancel}
        />
        <span {...stylex.props(styles.grow)} />
        {onDetails && (
          <IconButton
            label="Details"
            icon={<HugeiconsIcon icon={InformationCircleIcon} size={18} />}
            onClick={onDetails}
          />
        )}
      </div>
      <ScrollArea
        trackStyle={styles.track}
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
      >
        <div {...stylex.props(styles.column)}>
          <h1 {...stylex.props(styles.title, title === null && styles.titleNew)}>
            {title ?? "New note"}
          </h1>
          {(metaLine.length > 0 || tags.length > 0) && (
            <p {...stylex.props(styles.meta)}>
              {metaLine.map((part, index) => (
                <span key={part} {...stylex.props(styles.metaPart)}>
                  {index > 0 && <span aria-hidden="true" {...stylex.props(styles.dot)} />}
                  {part}
                </span>
              ))}
              {tags.map((tag) => (
                <span key={tag} {...stylex.props(styles.tag)}>
                  <span aria-hidden="true" {...stylex.props(styles.hash)}>
                    #
                  </span>
                  {tag}
                </span>
              ))}
            </p>
          )}
          <div ref={setOrigin} {...stylex.props(styles.surface)}>
            {state.empty && (
              <p aria-hidden="true" {...stylex.props(styles.placeholder)}>
                {placeholder}
              </p>
            )}
            <EditorContent editor={editor} />
            {origin && state.focused && state.emptyLine && !state.empty && !menuOpen && (
              <SlashHint editor={editor} origin={origin} />
            )}
            {origin && menuOpen && slash && (
              <SlashMenu
                editor={editor}
                slash={slash}
                options={options}
                active={active}
                origin={origin}
                onPick={(block) => applyBlock(editor, slash, block)}
              />
            )}
            {origin && ((state.hasSelection && state.focused) || linkDraft !== null) && (
              <SelectionBubble
                editor={editor}
                state={state}
                origin={origin}
                onLink={() => {
                  const current: unknown = editor.getAttributes("link").href;
                  setLinkDraft(typeof current === "string" ? current : "");
                }}
              >
                {linkDraft !== null && (
                  <LinkPopover
                    draft={linkDraft}
                    canRemove={state.link}
                    onDraftChange={(draft) => {
                      setLinkDraft(draft);
                      if (draft === null) editor.commands.focus();
                    }}
                    onApply={applyLink}
                    onRemove={() => {
                      editor.chain().focus().extendMarkRange("link").unsetLink().run();
                      setLinkDraft(null);
                    }}
                  />
                )}
              </SelectionBubble>
            )}
          </div>
        </div>
      </ScrollArea>
      {(dirty || error) && (
        <p
          role={error ? "alert" : "status"}
          {...stylex.props(styles.status, error !== null && styles.error)}
        >
          {error ?? (
            <>
              <span aria-hidden="true" {...stylex.props(styles.editedDot)} />
              Edited<span {...stylex.props(styles.keys)}>{saveKeys}</span>
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
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : saveLabel}
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
    gap: space.s1,
    height: "56px",
    paddingInline: "clamp(10px, 2vw, 20px)",
  },
  barScrolled: { backgroundImage: `linear-gradient(${color.frame} 70%, transparent)` },
  // The window's own buttons fill this corner on Windows and Linux.
  clearControls: { paddingRight: "118px" },
  grow: { flex: "1 1 auto" },
  track: { top: "58px" },
  column: {
    maxWidth: "640px",
    marginInline: "auto",
    paddingTop: "clamp(76px, 11vh, 104px)",
    paddingInline: "clamp(20px, 5vw, 44px)",
    // Clear of the status and buttons that float over the end of the note.
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
    color: color.inkStrong,
    textWrap: "balance",
  },
  titleNew: { color: color.faint },
  meta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space.s2,
    rowGap: space.s1,
    marginTop: space.s3,
    marginBottom: 0,
    fontFamily: font.body,
    fontSize: "13px",
    color: color.muted,
  },
  metaPart: { display: "inline-flex", alignItems: "center", gap: space.s2 },
  dot: {
    width: "3px",
    height: "3px",
    borderRadius: radius.round,
    backgroundColor: color.faint,
  },
  tag: {
    paddingBlock: "2px",
    paddingInline: "9px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    borderRadius: radius.round,
    backgroundColor: color.raised,
    fontSize: "12px",
    fontWeight: 500,
    color: color.inkSoft,
  },
  hash: { color: color.faint },
  surface: { position: "relative", marginTop: "30px" },
  placeholder: {
    position: "absolute",
    top: 0,
    insetInline: 0,
    margin: 0,
    fontFamily: font.writing,
    fontSize: "19px",
    lineHeight: 1.75,
    color: color.faint,
    pointerEvents: "none",
  },
  content: {
    minHeight: "40vh",
    outline: "none",
    fontFamily: font.writing,
    fontSize: "19px",
    lineHeight: 1.75,
    color: itemColor.writingInk,
    caretColor: color.accentStrong,
    "::selection": { backgroundColor: color.selection },
  },
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

  // The note's own nodes, handed to TipTap as class names.
  paragraph: { marginTop: 0, marginBottom: { default: "1.1em", ":last-child": 0 } },
  heading: {
    marginTop: { default: "1.4em", ":first-child": 0 },
    marginBottom: "0.5em",
    fontFamily: font.display,
    fontSize: "1.16em",
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
    color: color.inkStrong,
  },
  list: { marginTop: 0, marginBottom: "1.1em", paddingLeft: "22px" },
  listItem: { marginBlock: "4px" },
  taskList: { marginTop: 0, marginBottom: "1.1em", paddingLeft: 0, listStyleType: "none" },
  taskItem: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s3,
    marginBlock: "4px",
    accentColor: color.accent,
  },
  taskItemDone: { color: color.muted, textDecorationLine: "line-through" },
  blockquote: {
    marginBlock: "14px",
    marginInline: 0,
    paddingLeft: "13px",
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: itemColor.quoteRule,
    fontFamily: font.quote,
    fontStyle: "italic",
    fontSize: "0.85em",
    color: itemColor.quoteInk,
  },
  codeBlock: {
    marginBlock: "12px",
    paddingBlock: "11px",
    paddingInline: "13px",
    overflowX: "auto",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    borderRadius: radius.control,
    backgroundColor: color.app,
    fontFamily: font.mono,
    fontSize: "0.75em",
    lineHeight: 1.55,
    color: color.inkSoft,
  },
  code: {
    paddingBlock: "2px",
    paddingInline: "4px",
    borderRadius: "4px",
    backgroundColor: color.app,
    fontFamily: font.mono,
    fontSize: "0.75em",
    color: itemColor.codeInk,
  },
  link: {
    color: itemColor.linkInk,
    textDecorationLine: "underline",
    textDecorationColor: itemColor.linkRule,
    textUnderlineOffset: "3px",
  },
  horizontalRule: {
    marginBlock: "2em",
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.border,
  },
});

const className = (style: stylex.StyleXStyles) => stylex.props(style).className ?? "";

const classes: NoteClasses = {
  paragraph: className(styles.paragraph),
  heading: className(styles.heading),
  bulletList: className(styles.list),
  orderedList: className(styles.list),
  listItem: className(styles.listItem),
  taskList: className(styles.taskList),
  taskItem: className(styles.taskItem),
  taskItemDone: className(styles.taskItemDone),
  blockquote: className(styles.blockquote),
  codeBlock: className(styles.codeBlock),
  code: className(styles.code),
  link: className(styles.link),
  horizontalRule: className(styles.horizontalRule),
};

const extensions = noteExtensions(classes);
