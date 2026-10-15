export function createSingleFlightDirectoryPicker({ getParent, showOpenDialog }) {
  let inFlight = false;

  return async function chooseDirectory(title) {
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
