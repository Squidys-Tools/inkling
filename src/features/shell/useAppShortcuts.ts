import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AddMode } from "../../components/AddMenu/AddMenu";
import { appKeyboardShortcut } from "../../lib/keyboardShortcuts";
import type { LibraryItem } from "../../lib/types";
import { keepTabFocusInside } from "../../ui/keepTabFocusInside";
import type { ReadingItem } from "../item-view/useItemDetails";

type AppShortcutsOptions = {
  searchRef: RefObject<HTMLInputElement | null>;
  readingItem: ReadingItem | null;
  selectedItem: LibraryItem | null;
  pdfViewerItem: LibraryItem | null;
  isSettingsOpen: boolean;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  isAdding: boolean;
  isCapturing: boolean;
  captureMode: AddMode | null;
  setCaptureMode: Dispatch<SetStateAction<AddMode | null>>;
  openCapture: (mode?: AddMode | null) => void;
  closeCaptureModal: () => void;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export function useAppShortcuts({
  searchRef,
  readingItem,
  selectedItem,
  pdfViewerItem,
  isSettingsOpen,
  setIsSettingsOpen,
  isAdding,
  isCapturing,
  captureMode,
  setCaptureMode,
  openCapture,
  closeCaptureModal,
  setIsSidebarOpen,
}: AppShortcutsOptions) {
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const shortcutsModalRef = useRef<HTMLElement | null>(null);
  const shortcutsCloseRef = useRef<HTMLButtonElement>(null);
  const openCaptureRef = useRef(openCapture);
  const closeCaptureModalRef = useRef(closeCaptureModal);
  openCaptureRef.current = openCapture;
  closeCaptureModalRef.current = closeCaptureModal;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isShortcutsOpen) {
        event.preventDefault();
        setIsShortcutsOpen(false);
        return;
      }
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
          closeCaptureModalRef.current();
        }
        return;
      }
      if (isShortcutsOpen || isSettingsOpen || isAdding) return;
      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]'));
      const shortcut = appKeyboardShortcut(event, isEditableTarget);
      if (!shortcut) return;
      event.preventDefault();
      if (shortcut === "search") searchRef.current?.focus();
      else if (shortcut === "new-note" && !isCapturing) openCaptureRef.current("note");
      else if (shortcut === "help") setIsShortcutsOpen(true);
      else if (shortcut === "sidebar") setIsSidebarOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    captureMode,
    isAdding,
    isCapturing,
    isSettingsOpen,
    isShortcutsOpen,
    pdfViewerItem,
    readingItem,
    selectedItem,
    setIsSidebarOpen,
    setIsSettingsOpen,
    setCaptureMode,
    searchRef,
  ]);

  useEffect(() => {
    if (!isShortcutsOpen) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = shortcutsModalRef.current;
    shortcutsCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (dialog) keepTabFocusInside(event, dialog);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [isShortcutsOpen]);

  return { isShortcutsOpen, setIsShortcutsOpen, shortcutsModalRef, shortcutsCloseRef };
}
