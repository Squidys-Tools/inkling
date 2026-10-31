type DialogParent = {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  isVisible(): boolean;
  show(): void;
  focus(): void;
};

type OpenDialogResult = { canceled: boolean; filePaths: string[] };

/** A folder picker that opens over its window, at most one at a time, and gives focus back after. */
export function createSingleFlightDirectoryPicker<Parent extends DialogParent>(
  showOpenDialog: (
    parent: Parent,
    options: { properties: ["openDirectory", "createDirectory"]; title: string },
  ) => Promise<OpenDialogResult>,
) {
  let inFlight = false;

  return async function chooseDirectory(parent: Parent | null | undefined, title: string) {
    // A native picker must be the only dialog owning the main window.
    if (inFlight) return null;
    if (!parent || parent.isDestroyed()) return null;

    inFlight = true;
    try {
      const result = await showOpenDialog(parent, {
        properties: ["openDirectory", "createDirectory"],
        title,
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    } finally {
      inFlight = false;
      if (!parent.isDestroyed()) {
        if (parent.isMinimized()) parent.restore();
        if (!parent.isVisible()) parent.show();
        parent.focus();
      }
    }
  };
}
