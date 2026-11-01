import * as stylex from "@stylexjs/stylex";
import { useLayoutEffect, useRef, useState } from "react";
import { color, font, radius } from "@inkling/ui/tokens.stylex";
import { fitsTitleEdit, nameEnd, singleLine } from "./titleEdit.ts";

// Keep a filename's date and time together in both the title and its editor.
function keepNumbersTogether(title: string) {
  const parts = title
    .split(/(\d+(?:-\d+)+)/u)
    .map((text, at) => ({ text, id: `${at}:${text}`, number: at % 2 === 1 }));
  return parts.map(({ text, id, number }) =>
    number ? (
      <span key={id} {...stylex.props(styles.nowrap)}>
        {text}
      </span>
    ) : (
      text
    ),
  );
}

function selectRange(field: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  range.selectNodeContents(field);
  let offset = 0;
  let started = false;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const next = offset + (node.textContent?.length ?? 0);
    if (!started && start <= next) {
      range.setStart(node, start - offset);
      started = true;
    }
    if (end <= next) {
      range.setEnd(node, end - offset);
      break;
    }
    offset = next;
  }
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

function selectionOffsets(field: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return [0, 0];
  const range = selection.getRangeAt(0);
  if (!field.contains(range.commonAncestorContainer)) return [0, 0];
  const before = range.cloneRange();
  before.selectNodeContents(field);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return [start, start + range.toString().length];
}

function TitleEditor({ title, finish }: { title: string; finish: (value: string | null) => void }) {
  const field = useRef<HTMLSpanElement>(null);
  const settled = useRef(false);
  const settle = (save: boolean) => {
    if (settled.current) return;
    settled.current = true;
    finish(save ? singleLine(field.current?.textContent ?? "").trim() : null);
  };
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.focus();
    selectRange(element, 0, nameEnd(title));
    const snapshot = () => ({
      nodes: [...element.childNodes].map((node) => node.cloneNode(true)),
      offsets: selectionOffsets(element),
    });
    let previous = snapshot();
    let composing = false;
    const beforeInput = (event: InputEvent) => {
      if (composing || event.isComposing) return;
      previous = snapshot();
      const [start, end] = previous.offsets;
      const length = element.textContent?.length ?? 0;
      if (event.data !== null && !fitsTitleEdit(length, start, end, event.data))
        event.preventDefault();
    };
    const input = (event?: Event) => {
      if (composing || (event instanceof InputEvent && event.isComposing)) return;
      const value = element.textContent ?? "";
      const clean = singleLine(value);
      if (clean.length > 500) {
        element.replaceChildren(...previous.nodes.map((node) => node.cloneNode(true)));
        selectRange(element, previous.offsets[0], previous.offsets[1]);
      } else if (clean !== value) {
        element.textContent = clean;
        selectRange(element, clean.length, clean.length);
      }
      previous = snapshot();
    };
    const startComposition = () => {
      previous = snapshot();
      composing = true;
    };
    const endComposition = () => {
      composing = false;
      input();
    };
    element.addEventListener("beforeinput", beforeInput);
    element.addEventListener("input", input);
    element.addEventListener("compositionstart", startComposition);
    element.addEventListener("compositionend", endComposition);
    return () => {
      element.removeEventListener("beforeinput", beforeInput);
      element.removeEventListener("input", input);
      element.removeEventListener("compositionstart", startComposition);
      element.removeEventListener("compositionend", endComposition);
    };
  }, [title]);
  return (
    <span
      ref={field}
      role="textbox"
      aria-label="Title"
      aria-multiline={false}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={() => settle(true)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key !== "Enter" && event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        settle(event.key === "Enter");
      }}
      onPaste={(event) => {
        event.preventDefault();
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (!event.currentTarget.contains(range.commonAncestorContainer)) return;
        const length = event.currentTarget.textContent?.length ?? 0;
        const available = Math.max(0, 500 - length + selection.toString().length);
        const pasted = singleLine(event.clipboardData.getData("text/plain")).slice(0, available);
        range.deleteContents();
        const text = document.createTextNode(pasted);
        range.insertNode(text);
        range.setStartAfter(text);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }}
      {...stylex.props(styles.reset, styles.editor)}
    >
      {keepNumbersTogether(title)}
    </span>
  );
}

/** An inline title editor with the same wrapping and geometry as the title. */
export function TitleField({
  title,
  onRename,
}: {
  title: string;
  onRename: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <h2 {...stylex.props(styles.title)}>
      {editing ? (
        <TitleEditor
          title={title}
          finish={(value) => {
            setEditing(false);
            if (value && value !== title) onRename(value);
          }}
        />
      ) : (
        <button
          type="button"
          title="Rename"
          onClick={() => setEditing(true)}
          {...stylex.props(styles.reset, styles.button)}
        >
          {keepNumbersTogether(title)}
        </button>
      )}
    </h2>
  );
}

const styles = stylex.create({
  title: {
    margin: 0,
    fontFamily: font.body,
    fontSize: "26px",
    lineHeight: "30px",
    fontWeight: 600,
    letterSpacing: "-0.025em",
    color: color.ink,
    overflowWrap: "anywhere",
  },
  nowrap: { whiteSpace: "nowrap" },
  reset: {
    display: "block",
    width: "100%",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    lineHeight: "inherit",
    letterSpacing: "inherit",
    color: "inherit",
    textAlign: "left",
  },
  button: {
    cursor: "text",
    borderRadius: radius.control,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "3px",
  },
  editor: {
    minHeight: "30px",
    borderRadius: radius.control,
    backgroundColor: color.sunken,
    outline: `1px solid ${color.accent}`,
    whiteSpace: "pre-wrap",
  },
});
