import { useEffect, useRef, useState } from "react";
import {
  getAppVersion,
  getLastExport,
  getLibrarySize,
  isDesktopRuntime,
  type LastExport,
  type LibrarySize,
  listActiveItems,
} from "../../lib/libraryApi";
import type { ItemKind } from "../../lib/types";
import { keepTabFocusInside } from "../../ui/keepTabFocusInside";
import { cardKind } from "../library/libraryItem";
import { useAppearance } from "./appearance";

export type SettingsTab = "general" | "licenses" | "appearance" | "archive" | "data" | "extension";

type SettingsOptions = {
  canUseDesktopBackend: boolean;
  activeSpaceId: string | null;
  debouncedQuery: string;
};

export function useSettings({
  canUseDesktopBackend,
  activeSpaceId,
  debouncedQuery,
}: SettingsOptions) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [appearance, setAppearanceOption] = useAppearance();
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [librarySizeBytes, setLibrarySizeBytes] = useState<number | null>(null);
  // In the desktop app an open Space or search narrows `items`, so Settings
  // counts the whole library on its own. Null means `items` already is it.
  const [wholeLibraryKinds, setWholeLibraryKinds] = useState<ItemKind[] | null>(null);
  const [lastCopy, setLastCopy] = useState<LastExport | null>(null);
  const settingsDialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isSettingsOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus the dialog itself, not a control, so the sheet opens without a ring.
    const focusTimer = window.setTimeout(() => settingsDialogRef.current?.focus(), 0);

    const onSettingsKeyDown = (event: KeyboardEvent) => {
      const modal = settingsDialogRef.current;
      if (modal) keepTabFocusInside(event, modal);
    };

    document.addEventListener("keydown", onSettingsKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onSettingsKeyDown);
      previouslyFocused?.focus();
    };
  }, [isSettingsOpen]);

  const [wasSettingsOpen, setWasSettingsOpen] = useState(false);
  if (wasSettingsOpen !== isSettingsOpen) {
    setWasSettingsOpen(isSettingsOpen);
    if (!isSettingsOpen) setSettingsTab("general");
  }

  // Version, size and last copy are optional: each stays hidden when the
  // desktop backend cannot supply it (preview, or a failed call). The size
  // walks every asset file, so Settings shows the last measured value at once
  // and replaces it when a fresh walk finishes, without holding up the rest.
  useEffect(() => {
    if (!isSettingsOpen || !isDesktopRuntime()) return;
    let cancelled = false;
    void Promise.all([
      getAppVersion().catch(() => undefined),
      getLastExport().catch(() => undefined),
    ]).then(([version, copy]) => {
      if (cancelled) return;
      setAppVersion(version ?? null);
      setLastCopy(copy ?? null);
    });
    const showSize = (size: LibrarySize | undefined) => {
      if (!cancelled && size) setLibrarySizeBytes(size.bytes);
    };
    // Fired together so a first open, with nothing cached yet, shares one walk.
    void getLibrarySize().then(showSize, () => undefined);
    void getLibrarySize(true).then(showSize, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [isSettingsOpen]);

  const isLibraryNarrowed = Boolean(activeSpaceId) || debouncedQuery.trim() !== "";
  useEffect(() => {
    if (!isSettingsOpen || !canUseDesktopBackend || !isLibraryNarrowed) return;
    let cancelled = false;
    void listActiveItems().then(
      (cards) => {
        if (!cancelled) setWholeLibraryKinds(cards.map(cardKind));
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      setWholeLibraryKinds(null);
    };
  }, [canUseDesktopBackend, isLibraryNarrowed, isSettingsOpen]);

  const isArchiveTabOpen = isSettingsOpen && settingsTab === "archive";

  return {
    isSettingsOpen,
    setIsSettingsOpen,
    settingsTab,
    setSettingsTab,
    isArchiveTabOpen,
    appearance,
    setAppearanceOption,
    appVersion,
    librarySizeBytes,
    wholeLibraryKinds,
    lastCopy,
    setLastCopy,
    settingsDialogRef,
  };
}
