import * as stylex from "@stylexjs/stylex";
import { Button, Kbd } from "@inkling/ui";
import { color, font, itemColor, radius, space, text } from "@inkling/ui/tokens.stylex";
import { EditorContent, useEditor } from "@tiptap/react";
import { useRef, useState } from "react";
import { errorMessage } from "../library/errors.ts";
import { registerWritingFont } from "../reader/fonts.ts";
import { LinkPopover } from "./LinkPopover.tsx";
import { type NoteClasses, noteExtensions } from "./noteMarkdown.ts";
import { isSafeNoteLink, normalizeNoteBody } from "./notes.ts";
import { NoteToolbar, useToolbarState } from "./NoteToolbar.tsx";

/** What the editor hands its page when the user saves. */
export type NoteDraft = { markdown: string; text: string };

/**
 * The full-page note editor (Focus Mode), for a new note or an existing one.
 * Nothing is written until Save; `onChange` reports each edit so the page can
 * keep or guard the draft.
 */
// This module loads with the first editor, so the writing face loads with it.
registerWritingFont();

export function NoteEditor({
  kicker,
  name,
  initialMarkdown,
  placeholder,
  saveLabel,
  onSave,
  onCancel,
  onChange,
}: {
  kicker: string;
  name?: string;
  initialMarkdown: string;
  placeholder: string;
  saveLabel: string;
  /** Rejects with the library's message, which the editor shows. */
  onSave: (draft: NoteDraft) => Promise<void>;
  onCancel: () => void;
  /** `changed` compares with the opening text as the editor writes it, so undoing every edit reads as unchanged. */
  onChange?: (markdown: string, changed: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const opening = useRef("");
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
      handleKeyDown: (_view, event) => {
        // An Escape typed in the editor does not reach the page's window listener, so it leaves here.
        if (event.key === "Escape") onCancel();
        else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void save();
        else return false;
        return true;
      },
    },
    onCreate: ({ editor: current }) => {
      opening.current = normalizeNoteBody(current.getMarkdown());
    },
    onUpdate: ({ editor: current }) => {
      const markdown = normalizeNoteBody(current.getMarkdown());
      onChange?.(markdown, markdown !== opening.current);
    },
  });
  const state = useToolbarState(editor);

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
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  const applyLink = () => {
    const href = (linkDraft ?? "").trim();
    if (!isSafeNoteLink(href)) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkDraft(null);
  };

  return (
    <div data-escape-scope {...stylex.props(styles.page)}>
      <Button aria-label={`Close ${kicker.toLowerCase()}`} style={styles.exit} onClick={onCancel}>
        Close <Kbd>esc</Kbd>
      </Button>
      <div {...stylex.props(styles.column)}>
        <div {...stylex.props(styles.orientation)}>
          <span {...stylex.props(styles.kicker)}>{kicker}</span>
          {name && (
            <>
              <span aria-hidden="true" {...stylex.props(styles.rule)} />
              <span {...stylex.props(styles.name)}>{name}</span>
            </>
          )}
        </div>
        <div {...stylex.props(styles.surface)}>
          {state.empty && (
            <p aria-hidden="true" {...stylex.props(styles.placeholder)}>
              {placeholder}
            </p>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
      <div {...stylex.props(styles.actions)}>
        {error && (
          <p role="alert" {...stylex.props(styles.error)}>
            {error}
          </p>
        )}
        <NoteToolbar
          editor={editor}
          state={state}
          onLink={() => {
            const current: unknown = editor.getAttributes("link").href;
            setLinkDraft(typeof current === "string" ? current : "");
          }}
        />
        <div {...stylex.props(styles.cluster)}>
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
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

const styles = stylex.create({
  page: {
    position: "absolute",
    inset: 0,
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    backgroundColor: color.sunken,
    backgroundImage: `radial-gradient(ellipse at 50% 42%, ${itemColor.accentGlow}, transparent 58%)`,
  },
  exit: {
    position: "absolute",
    top: space.s4,
    right: space.s6,
    zIndex: 2,
    height: "28px",
    paddingInline: space.s3,
    borderRadius: radius.round,
    backgroundColor: { default: color.raised, ":hover": color.hover },
    fontSize: text.xs,
  },
  column: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minHeight: 0,
    width: "min(100%, 760px)",
    paddingTop: "clamp(64px, 12vh, 126px)",
  },
  orientation: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space.s3,
    minWidth: 0,
    paddingBottom: "22px",
    paddingInline: space.s5,
  },
  kicker: {
    flexShrink: 0,
    fontFamily: font.body,
    fontSize: "10px",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: color.accentStrong,
  },
  rule: { flexShrink: 0, width: "1px", height: "14px", backgroundColor: color.borderStrong },
  name: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.quote,
    fontSize: text.lg,
    color: itemColor.writingInk,
  },
  surface: {
    position: "relative",
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
    scrollbarWidth: "none",
    // Room for the action bar that floats over the end of the note.
    paddingBottom: "80px",
  },
  placeholder: {
    position: "absolute",
    top: space.s5,
    insetInline: "clamp(24px, 6vw, 76px)",
    margin: 0,
    fontFamily: font.writing,
    fontSize: "18px",
    lineHeight: 1.85,
    color: color.faint,
    pointerEvents: "none",
  },
  content: {
    minHeight: "100%",
    paddingTop: space.s5,
    paddingInline: "clamp(24px, 6vw, 76px)",
    paddingBottom: space.s10,
    outline: "none",
    fontFamily: font.writing,
    fontSize: "18px",
    lineHeight: 1.85,
    color: itemColor.writingInk,
    caretColor: color.accentStrong,
  },
  actions: {
    position: "absolute",
    insetInline: 0,
    bottom: 0,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    columnGap: "clamp(8px, 2vw, 18px)",
    rowGap: space.s2,
    minHeight: "66px",
    paddingBlock: "10px",
    paddingInline: space.s5,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.glassEdge,
    backgroundColor: color.glass,
    backdropFilter: "blur(18px)",
  },
  error: {
    flexBasis: "100%",
    margin: 0,
    textAlign: "center",
    fontSize: text.sm,
    color: color.danger,
  },
  cluster: { position: "relative", display: "flex", alignItems: "center", gap: space.s2 },

  // The note's own nodes, handed to TipTap as class names.
  paragraph: { marginTop: 0, marginBottom: { default: "1.25em", ":last-child": 0 } },
  heading: {
    marginTop: { default: "1.7em", ":first-child": 0 },
    marginBottom: "0.5em",
    fontFamily: font.quote,
    fontSize: "1.45em",
    fontWeight: 400,
    lineHeight: 1.3,
    color: itemColor.writingInk,
  },
  list: { marginTop: 0, marginBottom: "1.25em", paddingLeft: "22px" },
  listItem: { marginBlock: "4px" },
  taskList: { marginTop: 0, marginBottom: "1.25em", paddingLeft: 0, listStyleType: "none" },
  taskItem: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
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
