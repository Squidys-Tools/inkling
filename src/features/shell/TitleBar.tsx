import { isElectronRuntime } from "../../lib/libraryApi";
import { Button } from "../../ui/Button";

const control =
  "grid h-titlebar w-[46px] place-items-center text-[15px] text-muted cursor-default [-webkit-app-region:no-drag]";

export function TitleBar() {
  if (!isElectronRuntime()) return null;
  const controls = window.inkling?.windowControls;
  return (
    <>
      <div className="titlebar-drag fixed top-0 right-[138px] left-0 z-180 h-titlebar [-webkit-app-region:drag]" />
      {controls && (
        <div className="fixed top-0 right-0 z-200 flex h-titlebar [-webkit-app-region:no-drag]">
          <Button
            className={`${control} hover:bg-white/8 hover:text-ink`}
            aria-label="Minimize"
            onClick={() => void controls.minimize()}
          >
            <span aria-hidden="true">−</span>
          </Button>
          <Button
            className={`${control} hover:bg-white/8 hover:text-ink`}
            aria-label="Maximize or restore"
            onClick={() => void controls.toggleMaximize()}
          >
            <span aria-hidden="true">□</span>
          </Button>
          <Button
            className={`${control} hover:bg-[#c42b1c] hover:text-[#fff8ee]`}
            aria-label="Close window"
            onClick={() => void controls.close()}
          >
            <span aria-hidden="true">×</span>
          </Button>
        </div>
      )}
    </>
  );
}
