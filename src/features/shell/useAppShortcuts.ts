import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import type { useCapture } from "../capture/useCapture";
import { appKeyboardShortcut } from "../../lib/keyboardShortcuts";
import type { LibraryItem } from "../../lib/types";
import type { ReadingItem } from "../item-view/useItemDetails";

type AppShortcutsOptions = {
  searchRef: RefObject<HTMLInputElement | null>;
  readingItem: ReadingItem | null;
  selectedItem: LibraryItem | null;
  pdfViewerItem: LibraryItem | null;
  isSettingsOpen: boolean;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  capture: Pick<
    ReturnType<typeof useCapture>,
    | "isAdding"
    | "isCapturing"
    | "captureMode"
    | "setCaptureMode"
    | "openCapture"
    | "closeCaptureModal"
  >;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export function useAppShortcuts({
  searchRef,
  readingItem,
  selectedItem,
  pdfViewerItem,
  isSettingsOpen,
  setIsSettingsOpen,
  capture,
  setIsSidebarOpen,
}: AppShortcutsOptions) {
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const { isAdding, isCapturing, captureMode, setCaptureMode, openCapture, closeCaptureModal } =
      capture;
    if (isShortcutsOpen) return;
    if (readingItem || selectedItem || pdfViewerItem) return;
    if (event.key === "Escape") {
      if (isSettingsOpen) {
        event.preventDefault();
        setIsSettingsOpen(false);
      } else if (isAdding && captureMode) {
        event.preventDefault();
        setCaptureMode(null);
      } else if (isAdding) {
        event.preventDefault();
        closeCaptureModal();
      }
      return;
    }
    if (isSettingsOpen || isAdding) return;
    const target = event.target;
    const isEditableTarget =
      target instanceof HTMLElement &&
      (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]'));
    const shortcut = appKeyboardShortcut(event, isEditableTarget);
    if (!shortcut) return;
    event.preventDefault();
    if (shortcut === "search") searchRef.current?.focus();
    else if (shortcut === "new-note" && !isCapturing) {
      // The Add menu lives in the sidebar, so a note started from the keyboard opens it.
      setIsSidebarOpen(true);
      openCapture("note");
    } else if (shortcut === "help") setIsShortcutsOpen(true);
    else if (shortcut === "sidebar") setIsSidebarOpen((open) => !open);
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return { isShortcutsOpen, setIsShortcutsOpen };
}
