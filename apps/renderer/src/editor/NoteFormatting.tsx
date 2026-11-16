import BoldIcon from "@hugeicons/core-free-icons/BoldIcon";
import CodeIcon from "@hugeicons/core-free-icons/CodeIcon";
import Heading02Icon from "@hugeicons/core-free-icons/Heading02Icon";
import ItalicIcon from "@hugeicons/core-free-icons/ItalicIcon";
import Link01Icon from "@hugeicons/core-free-icons/Link01Icon";
import ListIcon from "@hugeicons/core-free-icons/ListIcon";
import ListOrderedIcon from "@hugeicons/core-free-icons/ListOrderedIcon";
import ListTodoIcon from "@hugeicons/core-free-icons/ListTodoIcon";
import QuoteIcon from "@hugeicons/core-free-icons/QuoteIcon";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { color, font, motion, radius, space, text } from "@inkling/ui/tokens.stylex";
import { TextSelection } from "@tiptap/pm/state";
import { type ChainedCommands, type Editor, useEditorState } from "@tiptap/react";
import type { ReactNode } from "react";

/** A paragraph that is only `/query`, with the caret at its end. */
export type SlashQuery = { query: string; from: number; to: number };

// The editor does not re-render on selection changes by itself, so the
// bubble and the menu subscribe to its state or they would lie about the caret.
export function useFormatState(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { selection } = current.state;
      const { $from, empty } = selection;
      const parent = $from.parent;
      const atLineEnd =
        empty && parent.type.name === "paragraph" && $from.parentOffset === parent.content.size;
      const typed = atLineEnd ? /^\/(\w*)$/u.exec(parent.textContent) : null;
      return {
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        link: current.isActive("link"),
        heading: current.isActive("heading"),
        quote: current.isActive("blockquote"),
        hasSelection: !empty && selection instanceof TextSelection,
        focused: current.isFocused,
        empty: current.isEmpty,
        emptyLine: atLineEnd && parent.content.size === 0,
        words: current.getText().split(/\s+/u).filter(Boolean).length,
        slash: typed ? { query: typed[1] ?? "", from: $from.start(), to: $from.pos } : null,
      };
    },
  });
}

export type FormatState = ReturnType<typeof useFormatState>;

type Block = {
  label: string;
  words: string;
  icon: IconSvgElement;
  apply: (chain: ChainedCommands) => ChainedCommands;
};

const blocks: readonly Block[] = [
  {
    label: "Bulleted list",
    words: "bullet list ul",
    icon: ListIcon,
    apply: (c) => c.toggleBulletList(),
  },
  {
    label: "Numbered list",
    words: "numbered ordered list ol",
    icon: ListOrderedIcon,
    apply: (c) => c.toggleOrderedList(),
  },
  {
    label: "To-do list",
    words: "todo task checklist",
    icon: ListTodoIcon,
    apply: (c) => c.toggleTaskList(),
  },
  {
    label: "Heading",
    words: "heading title",
    icon: Heading02Icon,
    apply: (c) => c.toggleHeading({ level: 2 }),
  },
  {
    label: "Quote",
    words: "quote blockquote",
    icon: QuoteIcon,
    apply: (c) => c.toggleBlockquote(),
  },
  {
    label: "Code block",
    words: "code block pre",
    icon: CodeIcon,
    apply: (c) => c.toggleCodeBlock(),
  },
];

export const slashBlocks = (query: string) => {
  const typed = query.toLowerCase();
  return blocks.filter(({ label, words }) =>
    `${label} ${words}`
      .toLowerCase()
      .split(/[\s-]+/u)
      .some((word) => word.startsWith(typed)),
  );
};

/** Replaces the typed `/query` with the block. */
export const applyBlock = (editor: Editor, { from, to }: SlashQuery, block: Block) =>
  block.apply(editor.chain().focus().deleteRange({ from, to })).run();

/** Where `pos` sits inside `origin`, which scrolls with the text. */
function caretBox(editor: Editor, pos: number, origin: HTMLElement) {
  const at = editor.view.coordsAtPos(pos);
  const box = origin.getBoundingClientRect();
  return { left: at.left - box.left, top: at.top - box.top, height: at.bottom - at.top };
}

function BubbleButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      {...stylex.props(styles.button, pressed && styles.pressed)}
    >
      {children}
    </button>
  );
}

/** Bold, italic and link for the selected words, then heading and quote for their block. */
export function SelectionBubble({
  editor,
  state,
  origin,
  onLink,
  children,
}: {
  editor: Editor;
  state: FormatState;
  origin: HTMLElement;
  onLink: () => void;
  /** The link field, which opens above the bubble. */
  children?: ReactNode;
}) {
  const { from, to } = editor.state.selection;
  const start = caretBox(editor, from, origin);
  const end = caretBox(editor, to, origin);
  const center = start.top === end.top ? (start.left + end.left) / 2 : start.left;
  const left = Math.min(Math.max(center, 120), origin.clientWidth - 120);
  return (
    <div {...stylex.props(styles.anchor, styles.at(left, start.top - 44))}>
      {/* Pressing a button must not take focus or the selection from the editor. */}
      <div
        role="toolbar"
        aria-label="Format selection"
        onMouseDown={(event) => event.preventDefault()}
        {...stylex.props(styles.bubble)}
      >
        <BubbleButton
          label="Bold"
          pressed={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <HugeiconsIcon icon={BoldIcon} size={14} />
        </BubbleButton>
        <BubbleButton
          label="Italic"
          pressed={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <HugeiconsIcon icon={ItalicIcon} size={14} />
        </BubbleButton>
        <BubbleButton label="Link" pressed={state.link} onClick={onLink}>
          <HugeiconsIcon icon={Link01Icon} size={14} />
        </BubbleButton>
        <span aria-hidden="true" {...stylex.props(styles.divider)} />
        <BubbleButton
          label="Heading"
          pressed={state.heading}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <span {...stylex.props(styles.letter)}>H</span>
        </BubbleButton>
        <BubbleButton
          label="Quote"
          pressed={state.quote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <HugeiconsIcon icon={QuoteIcon} size={14} />
        </BubbleButton>
      </div>
      {children}
    </div>
  );
}

/** The blocks a `/` can start, under the caret. Arrow keys and Enter come from the editor. */
export function SlashMenu({
  editor,
  slash,
  options,
  active,
  origin,
  onPick,
}: {
  editor: Editor;
  slash: SlashQuery;
  options: readonly Block[];
  active: number;
  origin: HTMLElement;
  onPick: (block: Block) => void;
}) {
  const caret = caretBox(editor, slash.from, origin);
  return (
    <div
      role="listbox"
      aria-label="Insert a block"
      onMouseDown={(event) => event.preventDefault()}
      {...stylex.props(styles.menu, styles.at(caret.left, caret.top + caret.height + 6))}
    >
      {options.map((block, index) => (
        <div
          key={block.label}
          role="option"
          aria-selected={index === active}
          onMouseDown={() => onPick(block)}
          {...stylex.props(styles.option, index === active && styles.optionActive)}
        >
          <span aria-hidden="true" {...stylex.props(styles.optionIcon)}>
            <HugeiconsIcon icon={block.icon} size={15} />
          </span>
          {block.label}
        </div>
      ))}
    </div>
  );
}

/** The faint offer on an empty line while the caret waits there. */
export function SlashHint({ editor, origin }: { editor: Editor; origin: HTMLElement }) {
  const caret = caretBox(editor, editor.state.selection.from, origin);
  return (
    <span
      aria-hidden="true"
      {...stylex.props(styles.hint, styles.line(caret.left + 10, caret.top, caret.height))}
    >
      Type / for a list, quote or code
    </span>
  );
}

const styles = stylex.create({
  at: (left: number, top: number) => ({ left, top }),
  line: (left: number, top: number, height: number) => ({ left, top, height }),
  anchor: { position: "absolute", zIndex: 5, transform: "translateX(-50%)" },
  bubble: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    padding: "3px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    borderRadius: "10px",
    backgroundColor: color.raised,
    boxShadow: `0 10px 24px ${color.shadow}`,
  },
  button: {
    display: "grid",
    placeItems: "center",
    minWidth: "30px",
    height: "28px",
    paddingInline: space.s2,
    borderWidth: 0,
    borderRadius: "7px",
    backgroundColor: { default: "transparent", ":hover": color.hover },
    color: { default: color.inkSoft, ":hover": color.inkStrong },
    cursor: "pointer",
    transitionProperty: "background-color, color",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  pressed: { backgroundColor: color.hover, color: color.inkStrong },
  letter: { fontFamily: font.display, fontSize: "12.5px", fontWeight: 600 },
  divider: {
    width: "1px",
    height: "16px",
    marginInline: "3px",
    backgroundColor: color.borderStrong,
  },
  menu: {
    position: "absolute",
    zIndex: 5,
    display: "flex",
    flexDirection: "column",
    minWidth: "196px",
    padding: "4px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    borderRadius: "10px",
    backgroundColor: color.raised,
    boxShadow: `0 14px 30px ${color.shadow}`,
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: space.s3,
    height: "32px",
    paddingInline: space.s2,
    borderRadius: radius.control,
    fontFamily: font.body,
    fontSize: text.md,
    color: color.inkSoft,
    cursor: "pointer",
  },
  optionActive: { backgroundColor: color.hover, color: color.inkStrong },
  optionIcon: { display: "inline-flex", color: color.muted },
  hint: {
    position: "absolute",
    display: "flex",
    alignItems: "center",
    fontFamily: font.body,
    fontSize: "12.5px",
    color: color.faint,
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
});
