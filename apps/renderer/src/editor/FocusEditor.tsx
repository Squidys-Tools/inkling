import * as stylex from "@stylexjs/stylex";
import { color, text } from "@inkling/ui/tokens.stylex";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { dayAndMonth } from "../format.ts";
import { describeItem } from "../item/model.ts";
import { useReaderNavigation, useStepBack } from "../item/navigation.ts";
import { useItem } from "../item/queries.ts";
import { useEscape } from "../item/useEscape.ts";
import { libraryClient } from "../library/connection.ts";
import { errorMessage } from "../library/errors.ts";
import { showWrittenCard } from "../library/writes.ts";
import { confirmDiscard, NoteEditor } from "./NoteEditor.tsx";
import { noteBodyForEditor, noteBodyForStorage, normalizeNoteBody } from "./notes.ts";

/** A saved note's page: its text, edited in place and saved only on Save. */
export function FocusEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const stepBack = useStepBack();
  const { showDetails } = useReaderNavigation();
  const query = useItem(id);
  const detail = query.data;
  // Every way out (Escape, Back, Details, the sidebar) asks before dropping unsaved
  // edits. Leaving waits for a save in flight.
  const dirty = useRef(false);
  const saving = useRef(false);
  const leave = () => {
    if (!saving.current)
      stepBack(() => void navigate({ to: "/item/$id", params: { id }, replace: true }));
  };
  useEscape(leave);
  useBlocker({
    shouldBlockFn: async ({ current, next }) =>
      current.pathname !== next.pathname && dirty.current && !(await confirmDiscard()),
    enableBeforeUnload: false,
  });

  const kind = detail?.kind.toLowerCase();
  const status =
    (query.isLoadingError && errorMessage(query.error)) ??
    (detail === null
      ? "This note is no longer in your library."
      : detail && kind !== "note"
        ? "Only notes open here."
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
      title={title}
      meta={["Note", dayAndMonth(detail.createdAt)]}
      tags={describeItem(detail).tags}
      initialMarkdown={initial}
      placeholder="Write…"
      saveLabel="Save"
      onChange={(_markdown, changed) => {
        dirty.current = changed;
      }}
      onCancel={leave}
      onDetails={() => showDetails(id)}
      onSave={async ({ markdown }) => {
        const body = noteBodyForStorage(stored, title, markdown);
        saving.current = true;
        try {
          showWrittenCard(await (await libraryClient()).updateItem({ id, body, bodyFormat: "md" }));
        } finally {
          saving.current = false;
        }
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
