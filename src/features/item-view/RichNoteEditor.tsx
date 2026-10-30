import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { noteEditorExtensions } from "../../lib/noteMarkdown";
import { isSafeNoteLink, noteBodyForEditor, noteBodyForStorage } from "../../lib/notes";
import { NoteEditorToolbar, useToolbarState } from "./NoteEditorToolbar";
import "./RichNoteEditor.css";
import { errorMessage } from "../errorMessage";

type RichNoteEditorProps = {
  body?: string;
  title: string;
  onSave: (body: string) => void | Promise<void>;
  onEditingChange: (editing: boolean) => void;
  focusMode: boolean;
  onFocusModeChange: (focusMode: boolean) => void;
};

// The item view owns when the editor opens; this component only ever edits.
export function RichNoteEditor({
  body,
  title,
  onSave,
  onEditingChange,
  focusMode,
  onFocusModeChange,
}: RichNoteEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
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
    if (!editor) return;
    editor.commands.setContent(noteBodyForEditor(body, title), {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [body, editor, title]);

  const [syncedNote, setSyncedNote] = useState({ body, title });
  if (syncedNote.body !== body || syncedNote.title !== title) {
    setSyncedNote({ body, title });
    setError(null);
    setLinkDraft(null);
  }

  useEffect(() => {
    if (!editor) return;
    editorRootRef.current?.scrollIntoView({ block: "start" });
    editor.commands.focus();
  }, [editor]);

  useEffect(() => {
    if (linkDraft === null) return;
    linkInputRef.current?.focus();
    linkInputRef.current?.select();
  }, [linkDraft]);

  const toolbar = useToolbarState(editor);

  if (body === undefined) {
    return (
      <p className="note-editor-loading" role="status">
        Loading note…
      </p>
    );
  }

  if (!editor) {
    return (
      <p className="note-editor-loading" role="status">
        Loading editor…
      </p>
    );
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
      await onSave(nextBody);
      onEditingChange(false);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      ref={editorRootRef}
      className={`note-editor is-editing note-embedded-editor ${focusMode ? "note-focus-editor" : ""}`}
      data-testid="rich-note-editor"
    >
      <div className={`note-embedded-orientation ${focusMode ? "is-focus-orientation" : ""}`}>
        <span className="note-embedded-kicker">{focusMode ? "Focus mode" : "Editing"}</span>
        <span className="note-embedded-divider" />
        <span className="note-embedded-name">{title}</span>
      </div>
      <div className="note-embedded-editor-surface">
        <EditorContent editor={editor} />
      </div>
      {error && (
        <p className="note-editor-error" role="alert">
          {error}
        </p>
      )}
      <div className="note-editor-actions">
        <NoteEditorToolbar editor={editor} state={toolbar} run={run} onLink={openLinkEditor} />
        <div className="note-editor-save-cluster">
          {isSaving && (
            <span className="note-editor-status" role="status">
              Saving…
            </span>
          )}
          {linkDraft !== null && (
            <fieldset className="note-link-popover" aria-label="Link">
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
              <button
                type="button"
                className="note-link-apply"
                aria-label="Apply link"
                disabled={!isSafeNoteLink(linkDraft.trim())}
                onClick={applyLink}
              >
                Apply
              </button>
              <button
                type="button"
                className="note-link-remove"
                aria-label="Remove link"
                disabled={!toolbar?.link}
                onClick={removeLink}
              >
                Remove
              </button>
            </fieldset>
          )}
          <button
            type="button"
            className="note-editor-focus-toggle"
            aria-pressed={focusMode}
            onClick={() => onFocusModeChange(!focusMode)}
          >
            {focusMode ? "Exit focus" : "Focus mode"}
          </button>
          <button
            type="button"
            className="note-editor-cancel"
            aria-label="Cancel note editing"
            onClick={() => {
              editor.commands.setContent(noteBodyForEditor(body, title), {
                contentType: "markdown",
                emitUpdate: false,
              });
              setError(null);
              setLinkDraft(null);
              onEditingChange(false);
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="note-editor-save"
            aria-label="Save note"
            disabled={isSaving}
            onClick={() => void save()}
          >
            {isSaving ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}
