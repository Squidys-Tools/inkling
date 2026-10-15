export function ElectronWindowControls() {
  const controls = typeof window === "undefined" ? undefined : window.inkling?.windowControls;

  if (!controls) return null;

  return (
    <div className="electron-window-controls">
      <button type="button" aria-label="Minimize" onClick={() => void controls.minimize()}>
        <span aria-hidden="true">−</span>
      </button>
      <button
        type="button"
        aria-label="Maximize or restore"
        onClick={() => void controls.toggleMaximize()}
      >
        <span aria-hidden="true">□</span>
      </button>
      <button
        type="button"
        className="electron-window-close"
        aria-label="Close window"
        onClick={() => void controls.close()}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
