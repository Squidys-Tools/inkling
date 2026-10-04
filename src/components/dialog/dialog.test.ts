import { afterEach, describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { dialogRootProps, escapeOwner, focusableWithin, handleEscape, registerDialog } from "./dialog";

// The defects these cover were all shipped and all silent: one Escape press
// closing two dialogs at once, a dialog announcing itself through an id that
// nothing carried, and the focus order that decides whether Tab leaves the
// surface or wraps inside it.

/** Register a dialog and return its release, tracking every release for cleanup. */
function open(closes: string[]): () => void {
  return openEntry(closes).release;
}

function openEntry(closes: string[]) {
  const entry = { onEscape: () => closes.push("escaped") };
  const release = registerDialog(entry);
  openDialogs.push(release);
  return { entry, release };
}

/** A press, and what it did. */
function press(key = "Escape") {
  const calls: string[] = [];
  return {
    calls,
    event: {
      key,
      preventDefault: () => calls.push("preventDefault"),
      stopPropagation: () => calls.push("stopPropagation"),
    },
  };
}

const openDialogs: Array<() => void> = [];

afterEach(() => {
  while (openDialogs.length > 0) openDialogs.pop()!();
});

describe("Escape ownership", () => {
  test("nothing owns Escape when no dialog is open", () => {
    expect(escapeOwner()).toBeNull();
  });

  test("the most recently opened dialog owns Escape", () => {
    const closes: string[] = [];
    open(closes);
    const release = open(closes);

    escapeOwner()?.onEscape();
    expect(closes).toEqual(["escaped"]);

    release();
  });

  test("releasing the topmost hands Escape back to the one below", () => {
    const closes: string[] = [];
    open(closes);
    const releaseTop = open(closes);

    releaseTop();
    escapeOwner()?.onEscape();
    expect(closes).toEqual(["escaped"]);
  });

  test("an older dialog unmounting leaves the newer one owning Escape", () => {
    // The reader is opened from the item overlay and mounts later, so it owns
    // Escape while the overlay is still open. Closing the overlay underneath it
    // must not promote the overlay's handler back.
    const closes: string[] = [];
    const releaseBottom = open(closes);
    open(closes);

    releaseBottom();
    expect(escapeOwner()).not.toBeNull();
    escapeOwner()?.onEscape();
    expect(closes).toEqual(["escaped"]);
  });

  test("releasing twice does not drop a sibling", () => {
    // React runs effect cleanup more than once in development.
    const closes: string[] = [];
    const releaseFirst = open(closes);
    open(closes);

    releaseFirst();
    releaseFirst();

    escapeOwner()?.onEscape();
    expect(closes).toEqual(["escaped"]);
  });

  test("only one dialog closes for one press", () => {
    const closes: string[] = [];
    open(closes);
    open(closes);
    open(closes);

    escapeOwner()?.onEscape();

    expect(closes).toHaveLength(1);
  });
});

describe("handleEscape", () => {
  test("the topmost dialog closes and claims the press", () => {
    const closes: string[] = [];
    const { entry } = openEntry(closes);
    const { event, calls } = press();

    expect(handleEscape(entry, event)).toBe(true);
    expect(closes).toEqual(["escaped"]);
    // Claiming the press is what stops an app-level handler from also firing.
    expect(calls).toEqual(["preventDefault", "stopPropagation"]);
  });

  test("a dialog underneath leaves the press alone", () => {
    // The reader opens from the item overlay without closing it. Pressing
    // Escape in the reader must not also dismiss the overlay behind it.
    const closes: string[] = [];
    const bottom = openEntry(closes);
    openEntry(closes);
    const { event, calls } = press();

    expect(handleEscape(bottom.entry, event)).toBe(false);
    expect(closes).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("keys other than Escape pass straight through", () => {
    const closes: string[] = [];
    const { entry } = openEntry(closes);
    const { event, calls } = press("ArrowLeft");

    expect(handleEscape(entry, event)).toBe(false);
    expect(closes).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("one press closes one dialog however deep they are stacked", () => {
    const closes: string[] = [];
    openEntry(closes);
    openEntry(closes);
    const top = openEntry(closes);
    const { event } = press();

    handleEscape(top.entry, event);

    expect(closes).toHaveLength(1);
  });
});

describe("dialogRootProps", () => {
  test("points aria-labelledby at the id it hands the heading", () => {
    const props = dialogRootProps({ labelId: "dlg-1", modal: true });
    expect(props["aria-labelledby"]).toBe("dlg-1");
    expect(props["aria-label"]).toBeUndefined();
  });

  test("uses aria-label when there is no heading to point at", () => {
    const props = dialogRootProps({ labelId: "dlg-1", label: "Add to your library", modal: true });
    expect(props["aria-label"]).toBe("Add to your library");
    expect(props["aria-labelledby"]).toBeUndefined();
  });

  test("reports the modality the surface actually has", () => {
    expect(dialogRootProps({ labelId: "a", label: "b", modal: true })["aria-modal"]).toBe(true);
    expect(dialogRootProps({ labelId: "a", label: "b", modal: false })["aria-modal"]).toBe(false);
  });

  test("is always a dialog, and reachable as a fallback focus target", () => {
    const props = dialogRootProps({ labelId: "a", modal: true });
    expect(props.role).toBe("dialog");
    // -1 keeps it out of the tab order while still giving the focus trap
    // somewhere to land when the dialog has nothing focusable inside it.
    expect(props.tabIndex).toBe(-1);
  });
});

describe("focusableWithin", () => {
  const html = `
    <div id="dialog">
      <button id="first">first</button>
      <button id="off" disabled>off</button>
      <a id="link" href="#x">link</a>
      <input id="text" />
      <input id="hidden" type="hidden" />
      <iframe id="embed"></iframe>
      <div id="manual" tabindex="0">manual</div>
      <div id="skipped" tabindex="-1">skipped</div>
    </div>`;

  test("returns what Tab can reach, in DOM order", () => {
    const { document } = parseHTML(html);
    const found = focusableWithin(document.getElementById("dialog")).map((el) => el.id);
    expect(found).toEqual(["first", "link", "text", "embed", "manual"]);
  });

  test("counts an embedded player as reachable", () => {
    // A YouTube embed in the reader is a focus boundary; leaving it out of the
    // list is how a trap loses focus into a cross-origin document.
    const { document } = parseHTML('<div id="d"><iframe id="embed"></iframe></div>');
    expect(focusableWithin(document.getElementById("d"))).toHaveLength(1);
  });

  test("has nothing to offer an empty or absent dialog", () => {
    // The capture modal's form unmounts for the length of its exit animation.
    const { document } = parseHTML('<div id="empty"></div>');
    expect(focusableWithin(document.getElementById("empty"))).toEqual([]);
    expect(focusableWithin(null)).toEqual([]);
    expect(focusableWithin(undefined)).toEqual([]);
  });
});