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
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { type Editor, useEditorState } from "@tiptap/react";

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

type ToolbarState = typeof IDLE_TOOLBAR;

// Tiptap does not re-render on selection changes on its own, so the toolbar
// state is subscribed separately or the controls would lie about the caret.
export function useToolbarState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor: instance }): ToolbarState =>
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
}

const HEADINGS = [1, 2, 3] as const;

type FormatButton = {
  label: string;
  icon: IconSvgElement;
  active: keyof ToolbarState;
  toggle: (editor: Editor) => void;
};

const INLINE: FormatButton[] = [
  {
    label: "Bold",
    icon: BoldIcon,
    active: "bold",
    toggle: (editor) => editor.chain().toggleBold().run(),
  },
  {
    label: "Italic",
    icon: ItalicIcon,
    active: "italic",
    toggle: (editor) => editor.chain().toggleItalic().run(),
  },
];

const BLOCKS: FormatButton[] = [
  {
    label: "Quote",
    icon: QuoteIcon,
    active: "quote",
    toggle: (editor) => editor.chain().toggleBlockquote().run(),
  },
  {
    label: "Code block",
    icon: CodeIcon,
    active: "code",
    toggle: (editor) => editor.chain().toggleCodeBlock().run(),
  },
  {
    label: "Bulleted list",
    icon: ListIcon,
    active: "bullet",
    toggle: (editor) => editor.chain().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    icon: ListOrderedIcon,
    active: "ordered",
    toggle: (editor) => editor.chain().toggleOrderedList().run(),
  },
  {
    label: "Todo list",
    icon: ListTodoIcon,
    active: "task",
    toggle: (editor) => editor.chain().toggleTaskList().run(),
  },
];

export function NoteEditorToolbar({
  editor,
  state,
  run,
  onLink,
}: {
  editor: Editor;
  state: ToolbarState | null;
  run: (command: () => void) => void;
  onLink: () => void;
}) {
  const formatButton = ({ label, icon, active, toggle }: FormatButton) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      aria-pressed={state?.[active]}
      onClick={() => run(() => toggle(editor))}
    >
      <HugeiconsIcon icon={icon} size={15} />
    </button>
  );
  return (
    <div
      className="note-editor-toolbar"
      role="toolbar"
      aria-label="Note formatting"
      onMouseDown={(event) => event.preventDefault()}
    >
      <span className="note-heading-group">
        {HEADINGS.map((level) => (
          <button
            key={level}
            type="button"
            aria-label={`Heading ${level}`}
            aria-pressed={state?.[`h${level}`]}
            onClick={() => run(() => editor.chain().toggleHeading({ level }).run())}
          >
            H{level}
          </button>
        ))}
      </span>
      <span className="note-control-divider" />
      {INLINE.map(formatButton)}
      <span className="note-control-divider" />
      {BLOCKS.map(formatButton)}
      <button
        type="button"
        aria-label="Link"
        aria-pressed={state?.link}
        disabled={!state?.hasSelection}
        onClick={onLink}
      >
        <HugeiconsIcon icon={Link01Icon} size={15} />
      </button>
      <span className="note-control-divider" />
      <button
        type="button"
        aria-label="Undo"
        disabled={!state?.canUndo}
        onClick={() => run(() => editor.chain().undo().run())}
      >
        <HugeiconsIcon icon={RefreshCcwIcon} size={15} />
      </button>
      <button
        type="button"
        aria-label="Redo"
        disabled={!state?.canRedo}
        onClick={() => run(() => editor.chain().redo().run())}
      >
        <HugeiconsIcon icon={RefreshCwIcon} size={15} />
      </button>
    </div>
  );
}
