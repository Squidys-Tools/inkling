import { expect, test } from "bun:test";
import { keepTabFocusInside } from "./accessibilityFocus";

function fixture() {
  let focused: Element | null = null;
  const first = {
    getClientRects: () => [{}],
    focus: () => {
      focused = first as unknown as Element;
    },
  } as unknown as HTMLElement;
  const last = {
    getClientRects: () => [{}],
    focus: () => {
      focused = last as unknown as Element;
    },
  } as unknown as HTMLElement;
  const dialog = {
    querySelectorAll: () => [first, last],
    contains: (element: Element | null) => element === first || element === last,
    focus: () => {
      focused = dialog as unknown as Element;
    },
  } as unknown as HTMLElement;
  return {
    dialog,
    first,
    last,
    get focused() {
      return focused;
    },
  };
}

function tabEvent(shiftKey = false) {
  let prevented = false;
  const event = {
    key: "Tab",
    shiftKey,
    preventDefault: () => {
      prevented = true;
    },
  };
  return {
    event,
    get prevented() {
      return prevented;
    },
  };
}

test("wraps Tab from the last focusable element to the first", () => {
  const view = fixture();
  const state = tabEvent();

  keepTabFocusInside(state.event, view.dialog, view.last);

  expect(state.prevented).toBe(true);
  expect(view.focused).toBe(view.first);
});

test("wraps Shift+Tab from the first focusable element to the last", () => {
  const view = fixture();
  const state = tabEvent(true);

  keepTabFocusInside(state.event, view.dialog, view.first);

  expect(state.prevented).toBe(true);
  expect(view.focused).toBe(view.last);
});

test("moves focus inside when it is outside the dialog", () => {
  const view = fixture();
  const outside = {} as Element;
  const state = tabEvent();

  keepTabFocusInside(state.event, view.dialog, outside);

  expect(state.prevented).toBe(true);
  expect(view.focused).toBe(view.first);
});

test("focuses the dialog when it contains no focusable elements", () => {
  const focused = { element: null as Element | null };
  const dialog = {
    querySelectorAll: () => [],
    contains: () => false,
    focus: () => {
      focused.element = dialog;
    },
  } as unknown as HTMLElement;
  const state = tabEvent();

  keepTabFocusInside(state.event, dialog, null);

  expect(state.prevented).toBe(true);
  expect(focused.element).toBe(dialog);
});

test("leaves non-Tab keys alone", () => {
  const { dialog, first } = fixture();
  const state = tabEvent();

  keepTabFocusInside({ ...state.event, key: "Enter" }, dialog, first);

  expect(state.prevented).toBe(false);
});
