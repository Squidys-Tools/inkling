import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { installTestDom } from "../testDom";
import { useAppShortcuts } from "./useAppShortcuts";

test.each([
  { isWelcomeOpen: false, opened: ["note"] },
  { isWelcomeOpen: true, opened: [] },
])("N with the welcome open: $isWelcomeOpen opens $opened", async ({ isWelcomeOpen, opened }) => {
  const { window: dom, restore } = installTestDom();
  const captures: string[] = [];
  function Probe() {
    useAppShortcuts({
      searchRef: { current: null },
      readingItem: null,
      selectedItem: null,
      pdfViewerItem: null,
      isWelcomeOpen,
      isSettingsOpen: false,
      setIsSettingsOpen: () => {},
      capture: {
        isAdding: false,
        isCapturing: false,
        captureMode: null,
        setCaptureMode: () => {},
        openCapture: (mode) => captures.push(String(mode)),
        closeCaptureModal: () => {},
      },
      setIsSidebarOpen: () => {},
    });
    return null;
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<Probe />));
    const key = new dom.Event("keydown", { cancelable: true });
    Object.assign(key, { key: "n", altKey: false, ctrlKey: false, metaKey: false });
    await act(async () => {
      window.dispatchEvent(key);
    });
    expect(captures).toEqual([...opened]);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});
