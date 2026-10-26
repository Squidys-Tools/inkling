import { Archive01Icon } from "@hugeicons/core-free-icons";
import type { LibraryItem } from "../../lib/types";
import { LibraryCard, type LibraryCardContext } from "../library/LibraryCard";
import { ArchiveGrid } from "./ArchiveGrid";
import {
  MONO_NOTE,
  pillButton,
  SETTINGS_SCROLL,
  SettingsEmptyState,
  SettingsHeader,
  SettingsPanel,
} from "./SettingsPanel";

export function ArchivePanel({
  items,
  isLoaded,
  selectionMode,
  selectedCount,
  context,
  onToggleSelectionMode,
  onRestoreSelected,
  onDeleteSelected,
  onClose,
}: {
  items: LibraryItem[];
  isLoaded: boolean;
  selectionMode: boolean;
  selectedCount: number;
  context: LibraryCardContext;
  onToggleSelectionMode: () => void;
  onRestoreSelected: () => void;
  onDeleteSelected: () => void;
  onClose: () => void;
}) {
  const one = items.length === 1;
  return (
    <SettingsPanel tab="archive" titleId="archive-panel-title">
      <SettingsHeader
        titleId="archive-panel-title"
        title="Archive"
        note={
          isLoaded && (
            <>
              {one
                ? "1 thing you put away. It waits here,"
                : `${items.length} things you put away. They wait here,`}{" "}
              out of your library, until you bring {one ? "it" : "them"} back or let{" "}
              {one ? "it" : "them"} go.
            </>
          )
        }
        tools={
          <fieldset className="m-0 flex min-w-0 items-center gap-2 border-0 p-0">
            <legend className="visually-hidden">Archive actions</legend>
            {selectionMode && (
              <>
                <span className={`${MONO_NOTE} whitespace-nowrap`} role="status" aria-live="polite">
                  {selectedCount} selected
                </span>
                <button
                  type="button"
                  className={pillButton()}
                  disabled={selectedCount === 0}
                  onClick={onRestoreSelected}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className={pillButton("danger")}
                  disabled={selectedCount === 0}
                  onClick={onDeleteSelected}
                >
                  Delete
                </button>
              </>
            )}
            <button
              type="button"
              className={pillButton(selectionMode ? "solid" : "plain")}
              aria-pressed={selectionMode}
              aria-label={selectionMode ? "Exit multi-select mode" : "Select archived items"}
              onClick={onToggleSelectionMode}
            >
              <span>{selectionMode ? "Done" : "Select"}</span>
            </button>
          </fieldset>
        }
        onClose={onClose}
      />
      {isLoaded && items.length > 0 ? (
        <ArchiveGrid data={items} context={context} ItemContent={LibraryCard} />
      ) : (
        <div className={SETTINGS_SCROLL}>
          {isLoaded && (
            <SettingsEmptyState icon={Archive01Icon} title="Your archive is empty.">
              Items you forget from the library will appear here.
            </SettingsEmptyState>
          )}
        </div>
      )}
    </SettingsPanel>
  );
}
