import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  Link01Icon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  QuoteIcon,
  RefreshCcwIcon,
  RefreshCwIcon,
} from "@hugeicons/core-free-icons";
import { noteEditorExtensions } from "../lib/noteMarkdown";
import { isSafeNoteLink, noteBodyForEditor, noteBodyForStorage } from "../lib/notes";

type RichNoteEditorProps = {
  body?: string;
  title: string;
  onSave: (body: string) => void | Promise<void>;
  onEditingChange?: (editing: boolean) => void;
  embedded?: boolean;
  focusMode?: boolean;
  onFocusModeChange?: (focusMode: boolean) => void;
};

const IDLE_TOOLBAR = {
  h1: false,
  h2: false,
  h3: false,
  bold: false,
  italic: false,
  quote: false,
  code: false,
  bullet: false,
  ordered: false,
  task: false,
  link: false,
  hasSelection: false,
  canUndo: false,
  canRedo: false,
};

// Editing only happens inside the expanded overlay, which owns when the editor
// opens. This component only ever edits; rendering a stored note as sanitized
// HTML is a separate concern, if the product ever asks for it.
export function RichNoteEditor({
  body,
  title,
  onSave,
  onEditingChange,
  embedded = false,
  focusMode = false,
  onFocusModeChange,
}: RichNoteEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const saveRef = useRef(onSave);
  const editorRootRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: noteEditorExtensions,
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "note-editor-content",
        role: "textbox",
        "aria-label": "Note content",
        "aria-multiline": "true",
      },
    },
  });

  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(noteBodyForEditor(body, title), { contentType: "markdown", emitUpdate: false });
    setError(null);
    setLinkDraft(null);
  }, [body, editor, title]);

  useEffect(() => {
    if (!embedded || !editor) return;
    editorRootRef.current?.scrollIntoView({ block: "start" });
    editor.commands.focus();
  }, [editor, embedded]);

  useEffect(() => {
    if (linkDraft === null) return;
    linkInputRef.current?.focus();
    linkInputRef.current?.select();
  }, [linkDraft]);

  // Tiptap does not re-render on selection changes on its own, so the toolbar
  // state is subscribed separately or the controls would lie about the caret.
  const toolbar = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance
        ? {
            h1: instance.isActive("heading", { level: 1 }),
            h2: instance.isActive("heading", { level: 2 }),
            h3: instance.isActive("heading", { level: 3 }),
            bold: instance.isActive("bold"),
            italic: instance.isActive("italic"),
            quote: instance.isActive("blockquote"),
            code: instance.isActive("codeBlock"),
            bullet: instance.isActive("bulletList"),
            ordered: instance.isActive("orderedList"),
            task: instance.isActive("taskList"),
            link: instance.isActive("link"),
            hasSelection: !instance.state.selection.empty,
            canUndo: instance.can().undo(),
            canRedo: instance.can().redo(),
          }
        : IDLE_TOOLBAR,
  });

  if (body === undefined) {
    return <p className="note-editor-loading" role="status">Loading note…</p>;
  }

  if (!editor) {
    return <p className="note-editor-loading" role="status">Loading editor…</p>;
  }

  const run = (command: () => void) => {
    setLinkDraft(null);
    command();
    editor.commands.focus();
  };

  const openLinkEditor = () => {
    const current = editor.isActive("link") ? editor.getAttributes("link").href : "";
    setLinkDraft(typeof current === "string" ? current : "");
  };

  const applyLink = () => {
    const value = (linkDraft ?? "").trim();
    if (!isSafeNoteLink(value)) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run();
    setLinkDraft(null);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkDraft(null);
  };

  const save = async () => {
    // Emptiness is decided on the edited text, before the title heading goes
    // back on, so a note the user cleared is refused the same way `update_item`
    // refuses an empty body.
    const nextBody = noteBodyForStorage(body, title, editor.getMarkdown());
    if (!nextBody) {
      setError("A note needs some text before it can be saved.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await saveRef.current(nextBody);
      onEditingChange?.(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      ref={editorRootRef}
      className={`note-editor is-editing ${embedded ? "note-embedded-editor" : ""} ${focusMode ? "note-focus-editor" : ""}`}
      data-testid="rich-note-editor"
    >
      {embedded && (
        <div className={`note-embedded-orientation ${focusMode ? "is-focus-orientation" : ""}`}>
          <span className="note-embedded-kicker">{focusMode ? "Focus mode" : "Editing"}</span>
          <span className="note-embedded-divider" />
          <span className="note-embedded-name">{title}</span>
        </div>
      )}
      <div className="note-embedded-editor-surface">
        <EditorContent editor={editor} />
      </div>
      {error && <p className="note-editor-error" role="alert">{error}</p>}
      <div className="note-editor-actions">
        <div
          className="note-editor-toolbar"
          role="toolbar"
          aria-label="Note formatting"
          onMouseDown={(event) => event.preventDefault()}
        >
          <span className="note-heading-group">
            <button type="button" aria-label="Heading 1" aria-pressed={toolbar?.h1} onClick={() => run(() => editor.chain().toggleHeading({ level: 1 }).run())}>H1</button>
            <button type="button" aria-label="Heading 2" aria-pressed={toolbar?.h2} onClick={() => run(() => editor.chain().toggleHeading({ level: 2 }).run())}>H2</button>
            <button type="button" aria-label="Heading 3" aria-pressed={toolbar?.h3} onClick={() => run(() => editor.chain().toggleHeading({ level: 3 }).run())}>H3</button>
          </span>
          <span className="note-control-divider" />
          <button type="button" aria-label="Bold" aria-pressed={toolbar?.bold} onClick={() => run(() => editor.chain().toggleBold().run())}>
            <HugeiconsIcon icon={BoldIcon} size={15} />
          </button>
          <button type="button" aria-label="Italic" aria-pressed={toolbar?.italic} onClick={() => run(() => editor.chain().toggleItalic().run())}>
            <HugeiconsIcon icon={ItalicIcon} size={15} />
          </button>
          <span className="note-control-divider" />
          <button type="button" aria-label="Quote" aria-pressed={toolbar?.quote} onClick={() => run(() => editor.chain().toggleBlockquote().run())}>
            <HugeiconsIcon icon={QuoteIcon} size={15} />
          </button>
          <button type="button" aria-label="Code block" aria-pressed={toolbar?.code} onClick={() => run(() => editor.chain().toggleCodeBlock().run())}>
            <HugeiconsIcon icon={CodeIcon} size={15} />
          </button>
          <button type="button" aria-label="Bulleted list" aria-pressed={toolbar?.bullet} onClick={() => run(() => editor.chain().toggleBulletList().run())}>
            <HugeiconsIcon icon={ListIcon} size={15} />
          </button>
          <button type="button" aria-label="Numbered list" aria-pressed={toolbar?.ordered} onClick={() => run(() => editor.chain().toggleOrderedList().run())}>
            <HugeiconsIcon icon={ListOrderedIcon} size={15} />
          </button>
          <button type="button" aria-label="Todo list" aria-pressed={toolbar?.task} onClick={() => run(() => editor.chain().toggleTaskList().run())}>
            <HugeiconsIcon icon={ListTodoIcon} size={15} />
          </button>
          <button type="button" aria-label="Link" aria-pressed={toolbar?.link} disabled={!toolbar?.hasSelection} onClick={openLinkEditor}>
            <HugeiconsIcon icon={Link01Icon} size={15} />
          </button>
          <span className="note-control-divider" />
          <button type="button" aria-label="Undo" disabled={!toolbar?.canUndo} onClick={() => run(() => editor.chain().undo().run())}>
            <HugeiconsIcon icon={RefreshCcwIcon} size={15} />
          </button>
          <button type="button" aria-label="Redo" disabled={!toolbar?.canRedo} onClick={() => run(() => editor.chain().redo().run())}>
            <HugeiconsIcon icon={RefreshCwIcon} size={15} />
          </button>
        </div>
        <div className="note-editor-save-cluster">
          {isSaving && <span className="note-editor-status" role="status">Saving…</span>}
          {linkDraft !== null && (
            <div className="note-link-popover" role="group" aria-label="Link">
              <input
                ref={linkInputRef}
                className="note-link-input"
                aria-label="Link URL"
                value={linkDraft}
                placeholder="https://"
                onChange={(event) => setLinkDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyLink();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setLinkDraft(null);
                  }
                }}
              />
              <button type="button" className="note-link-apply" aria-label="Apply link" disabled={!isSafeNoteLink(linkDraft.trim())} onClick={applyLink}>
                Apply
              </button>
              <button type="button" className="note-link-remove" aria-label="Remove link" disabled={!toolbar?.link} onClick={removeLink}>
                Remove
              </button>
            </div>
          )}
          {embedded && (
            <button
              type="button"
              className="note-editor-focus-toggle"
              aria-pressed={focusMode}
              onClick={() => onFocusModeChange?.(!focusMode)}
            >
              {focusMode ? "Exit focus" : "Focus mode"}
            </button>
          )}
          <button
            type="button"
            className="note-editor-cancel"
            aria-label="Cancel note editing"
            onClick={() => {
              editor.commands.setContent(noteBodyForEditor(body, title), { contentType: "markdown", emitUpdate: false });
              setError(null);
              setLinkDraft(null);
              onEditingChange?.(false);
            }}
          >
            Cancel
          </button>
          <button type="button" className="note-editor-save" aria-label="Save note" disabled={isSaving} onClick={() => void save()}>
            {isSaving ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}
