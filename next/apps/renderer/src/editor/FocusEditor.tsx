import * as stylex from "@stylexjs/stylex";
import { color, text } from "@inkling/ui/tokens.stylex";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { desktop } from "../desktop.ts";
import { useStepBack } from "../item/navigation.ts";
import { useItem } from "../item/queries.ts";
import { useEscape } from "../item/useEscape.ts";
import { useMounted } from "../item/useMounted.ts";
import { libraryClient } from "../library/connection.ts";
import { NoteEditor } from "./NoteEditor.tsx";
import { noteBodyForEditor, noteBodyForStorage, normalizeNoteBody } from "./notes.ts";

async function confirmDiscard() {
  const options = {
    message: "Discard your changes to this note?",
    confirmLabel: "Discard",
    destructive: true,
  };
  return desktop ? desktop.confirm(options) : window.confirm(options.message);
}

/** Focus Mode for a saved note: the whole stage to write in, saved only on Save. */
export function FocusEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const stepBack = useStepBack();
  const query = useItem(id);
  const detail = query.value;
  // Every way out (Escape, Cancel, Back, the sidebar) asks before dropping unsaved
  // edits. Leaving waits for a save in flight, which leaves by itself when it lands.
  const dirty = useRef(false);
  const saving = useRef(false);
  const mounted = useMounted();
  const leave = () => {
    if (!saving.current)
      stepBack(() => void navigate({ to: "/item/$id", params: { id }, replace: true }));
  };
  useEscape(leave);
  useBlocker({
    shouldBlockFn: async () => dirty.current && !(await confirmDiscard()),
    enableBeforeUnload: false,
  });

  const kind = detail?.kind.toLowerCase();
  const status =
    query.error ??
    (detail === null
      ? "This note is no longer in your library."
      : detail && kind !== "note"
        ? "Only notes open in Focus Mode."
        : null);
  if (status)
    return (
      <p role="alert" {...stylex.props(styles.status)}>
        {status}
      </p>
    );
  if (!detail) return null;

  const title = detail.title?.trim() || "Untitled note";
  const stored = normalizeNoteBody(detail.body);
  const initial = noteBodyForEditor(stored, title);
  return (
    <NoteEditor
      key={detail.id}
      kicker="Focus mode"
      name={title}
      initialMarkdown={initial}
      placeholder="Write…"
      saveLabel="Save note"
      onChange={(_markdown, changed) => {
        dirty.current = changed;
      }}
      onCancel={leave}
      onSave={async ({ markdown }) => {
        const body = noteBodyForStorage(stored, title, markdown);
        saving.current = true;
        try {
          await (await libraryClient()).updateItem({ id, body, bodyFormat: "md" });
          dirty.current = false;
        } finally {
          saving.current = false;
        }
        if (mounted.current) leave();
      }}
    />
  );
}

const styles = stylex.create({
  status: {
    position: "absolute",
    inset: 0,
    zIndex: 10,
    display: "grid",
    placeItems: "center",
    margin: 0,
    backgroundColor: color.sunken,
    fontSize: text.lg,
    color: color.muted,
  },
});
