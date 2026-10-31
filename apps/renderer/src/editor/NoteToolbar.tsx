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
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, text } from "@inkling/ui/tokens.stylex";
import { type Editor, useEditorState } from "@tiptap/react";
import type { ReactNode } from "react";

// The editor does not re-render on selection changes by itself, so the
// toolbar subscribes to its state or the buttons would lie about the caret.
export function useToolbarState(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      h1: current.isActive("heading", { level: 1 }),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      quote: current.isActive("blockquote"),
      code: current.isActive("codeBlock"),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      task: current.isActive("taskList"),
      link: current.isActive("link"),
      hasSelection: !current.state.selection.empty,
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
      empty: current.isEmpty,
    }),
  });
}

export type ToolbarState = ReturnType<typeof useToolbarState>;

type Format = {
  label: string;
  icon: IconSvgElement;
  active: keyof ToolbarState;
  toggle: (editor: Editor) => void;
};

const inline: Format[] = [
  {
    label: "Bold",
    icon: BoldIcon,
    active: "bold",
    toggle: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: "Italic",
    icon: ItalicIcon,
    active: "italic",
    toggle: (e) => e.chain().focus().toggleItalic().run(),
  },
];

const blocks: Format[] = [
  {
    label: "Quote",
    icon: QuoteIcon,
    active: "quote",
    toggle: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    label: "Code block",
    icon: CodeIcon,
    active: "code",
    toggle: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    label: "Bulleted list",
    icon: ListIcon,
    active: "bullet",
    toggle: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    icon: ListOrderedIcon,
    active: "ordered",
    toggle: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Todo list",
    icon: ListTodoIcon,
    active: "task",
    toggle: (e) => e.chain().focus().toggleTaskList().run(),
  },
];

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
  style,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  style?: stylex.StyleXStyles;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      {...stylex.props(styles.button, pressed && styles.pressed, style)}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden="true" {...stylex.props(styles.divider)} />;

export function NoteToolbar({
  editor,
  state,
  onLink,
}: {
  editor: Editor;
  state: ToolbarState;
  onLink: () => void;
}) {
  const format = ({ label, icon, active, toggle }: Format) => (
    <ToolButton
      key={label}
      label={label}
      pressed={Boolean(state[active])}
      onClick={() => toggle(editor)}
    >
      <HugeiconsIcon icon={icon} size={15} />
    </ToolButton>
  );
  return (
    // Pressing a button must not take focus or the selection from the editor.
    <div
      role="toolbar"
      aria-label="Note formatting"
      onMouseDown={(event) => event.preventDefault()}
      {...stylex.props(styles.toolbar)}
    >
      <span {...stylex.props(styles.headings)}>
        {([1, 2, 3] as const).map((level) => (
          <ToolButton
            key={level}
            label={`Heading ${level}`}
            pressed={state[`h${level}`]}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            style={styles.heading}
          >
            H{level}
          </ToolButton>
        ))}
      </span>
      <Divider />
      {inline.map(format)}
      <Divider />
      {blocks.map(format)}
      <ToolButton
        label="Link"
        pressed={state.link}
        disabled={!state.hasSelection && !state.link}
        onClick={onLink}
      >
        <HugeiconsIcon icon={Link01Icon} size={15} />
      </ToolButton>
      <Divider />
      <ToolButton
        label="Undo"
        disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <HugeiconsIcon icon={RefreshCcwIcon} size={15} />
      </ToolButton>
      <ToolButton
        label="Redo"
        disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <HugeiconsIcon icon={RefreshCwIcon} size={15} />
      </ToolButton>
    </div>
  );
}

const styles = stylex.create({
  toolbar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3px" },
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "30px",
    height: "26px",
    padding: 0,
    borderWidth: 0,
    borderRadius: "7px",
    backgroundColor: { default: "transparent", ":hover": color.hover, ":disabled": "transparent" },
    color: { default: color.inkSoft, ":hover": color.ink, ":disabled": color.faint },
    cursor: { default: "pointer", ":disabled": "default" },
    fontFamily: font.body,
    fontSize: text.xs,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  pressed: { backgroundColor: color.raised, color: color.ink },
  headings: {
    display: "flex",
    alignItems: "center",
    height: "22px",
    marginRight: "2px",
    paddingInline: "2px",
    borderRadius: "6px",
    backgroundColor: color.raised,
  },
  heading: {
    minWidth: "22px",
    height: "22px",
    borderRadius: radius.control,
    backgroundColor: "transparent",
    fontFamily: font.quote,
    fontSize: text.sm,
    color: color.faint,
  },
  divider: {
    width: "1px",
    height: "14px",
    marginInline: "7px",
    backgroundColor: color.border,
  },
});
