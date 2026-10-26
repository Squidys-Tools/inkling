type DialogParent = {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  isVisible(): boolean;
  show(): void;
  focus(): void;
};

type OpenDialogResult = { canceled: boolean; filePaths: string[] };

export function createSingleFlightDirectoryPicker<Parent extends DialogParent>({
  getParent,
  showOpenDialog,
}: {
  getParent: () => Parent | null | undefined;
  showOpenDialog: (
    parent: Parent,
    options: { properties: ["openDirectory"]; title: string },
  ) => Promise<OpenDialogResult>;
}) {
  let inFlight = false;

  return async function chooseDirectory(title: string) {
    // A native picker must be the only dialog owning the main window.
    if (inFlight) return null;

    const parent = getParent();
    if (!parent || parent.isDestroyed()) return null;

    inFlight = true;
    try {
      const result = await showOpenDialog(parent, { properties: ["openDirectory"], title });
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
