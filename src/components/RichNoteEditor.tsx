import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { noteEditorExtensions, renderNoteMarkdown } from "../lib/noteMarkdown";
import { noteBodyForEditor, noteBodyForPreview, noteBodyForStorage } from "../lib/notes";

type RichNoteEditorProps = {
  body?: string;
  title: string;
  onSave: (body: string) => void | Promise<void>;
  onEditingChange?: (editing: boolean) => void;
  showEditButton?: boolean;
  studio?: boolean;
};

function isSafeLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function RichNoteEditor({ body, title, onSave, onEditingChange, showEditButton = true, studio = false }: RichNoteEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveRef = useRef(onSave);
  const editorRootRef = useRef<HTMLDivElement>(null);
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
    setIsEditing(false);
    setError(null);
  }, [body, editor, title]);

  useEffect(() => {
    if ((!isEditing && !studio) || !editor) return;
    editorRootRef.current?.scrollIntoView({ block: "start" });
    editor.commands.focus();
  }, [editor, isEditing, studio]);

  const previewHtml = useMemo(
    () => (body === undefined ? "" : renderNoteMarkdown(noteBodyForPreview(body, title))),
    [body, title],
  );

  if (body === undefined) {
    return <p className="note-editor-loading" role="status">Loading note…</p>;
  }

  if (!isEditing && !studio) {
    return (
      <div className="note-editor" data-testid="rich-note-editor">
        {body ? (
          <div className="note-editor-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        ) : (
          <p className="note-editor-empty">This note is empty.</p>
        )}
        {showEditButton && (
          <button
            type="button"
            className="note-editor-edit"
            aria-label="Edit note"
            onClick={() => {
              setError(null);
              setIsEditing(true);
              onEditingChange?.(true);
            }}
          >
            Edit note
          </button>
        )}
      </div>
    );
  }

  if (!editor) {
    return <p className="note-editor-loading" role="status">Loading editor…</p>;
  }

  const run = (command: () => void) => {
    command();
    editor.commands.focus();
  };

  const addLink = () => {
    const value = window.prompt("Link URL");
    if (!value || !isSafeLink(value)) return;
    run(() => editor.chain().focus().setLink({ href: value }).run());
  };

  const save = async () => {
    const nextBody = noteBodyForStorage(body, title, editor.getMarkdown());
    if (!nextBody) {
      setError("A note needs some text before it can be saved.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await saveRef.current(nextBody);
      setIsEditing(false);
      onEditingChange?.(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div ref={editorRootRef} className={`note-editor is-editing ${studio ? "note-studio-editor" : ""}`} data-testid="rich-note-editor">
      {studio && (
        <div className="note-studio-title-block">
          <span className="note-studio-kicker">FIELD NOTE</span>
          <h1>{title}</h1>
        </div>
      )}
      <div className="note-editor-toolbar" role="toolbar" aria-label="Note formatting">
        {studio && <span className="note-editor-toolbar-label">FORMAT</span>}
        <button type="button" aria-label="Heading 1" aria-pressed={editor.isActive("heading", { level: 1 })} onClick={() => run(() => editor.chain().toggleHeading({ level: 1 }).run())}>H1</button>
        <button type="button" aria-label="Heading 2" aria-pressed={editor.isActive("heading", { level: 2 })} onClick={() => run(() => editor.chain().toggleHeading({ level: 2 }).run())}>H2</button>
        <button type="button" aria-label="Heading 3" aria-pressed={editor.isActive("heading", { level: 3 })} onClick={() => run(() => editor.chain().toggleHeading({ level: 3 }).run())}>H3</button>
        <button type="button" aria-label="Bold" aria-pressed={editor.isActive("bold")} onClick={() => run(() => editor.chain().toggleBold().run())}>B</button>
        <button type="button" aria-label="Italic" aria-pressed={editor.isActive("italic")} onClick={() => run(() => editor.chain().toggleItalic().run())}>I</button>
        <button type="button" aria-label="Bulleted list" aria-pressed={editor.isActive("bulletList")} onClick={() => run(() => editor.chain().toggleBulletList().run())}>• List</button>
        <button type="button" aria-label="Numbered list" aria-pressed={editor.isActive("orderedList")} onClick={() => run(() => editor.chain().toggleOrderedList().run())}>1. List</button>
        <button type="button" aria-label="Todo list" aria-pressed={editor.isActive("taskList")} onClick={() => run(() => editor.chain().toggleTaskList().run())}>☑ Todo</button>
        <button type="button" aria-label="Add link" aria-pressed={editor.isActive("link")} onClick={addLink}>Link</button>
      </div>
      {studio ? (
        <div className="note-studio-editor-surface">
          <EditorContent editor={editor} />
        </div>
      ) : (
        <EditorContent editor={editor} />
      )}
      {error && <p className="note-editor-error" role="alert">{error}</p>}
      <div className="note-editor-actions">
        <span className="note-editor-status" role="status">{isSaving ? "Saving…" : "Markdown source"}</span>
        <button
          type="button"
          className="note-editor-cancel"
          aria-label="Cancel note editing"
          onClick={() => {
            editor.commands.setContent(noteBodyForEditor(body, title), { contentType: "markdown", emitUpdate: false });
            setError(null);
            setIsEditing(false);
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
  );
}
