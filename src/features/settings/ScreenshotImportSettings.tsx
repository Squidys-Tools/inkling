import { Camera01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from "react";
import type { ScreenshotImportState } from "@inkling/contracts";
import { SegmentedControl } from "../../components/SegmentedControl/SegmentedControl";
import {
  chooseScreenshotImportDirectory,
  getScreenshotImportState,
  isDesktopRuntime,
  setScreenshotImportEnabled,
} from "../../lib/libraryApi";
import { pillButton, SettingsRow } from "./SettingsPanel";

export function ScreenshotImportSettings() {
  const [state, setState] = useState<ScreenshotImportState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const desktop = isDesktopRuntime();
  useEffect(() => {
    mounted.current = true;
    if (desktop)
      void getScreenshotImportState().then(
        (next) => {
          if (mounted.current) setState(next);
        },
        () => {
          if (mounted.current) setError("Screenshot import is unavailable in this preview.");
        },
      );
    return () => {
      mounted.current = false;
    };
  }, [desktop]);
  const change = async (operation: () => Promise<ScreenshotImportState>) => {
    if (pending.current || !mounted.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await operation();
      if (mounted.current) setState(next);
    } catch {
      if (mounted.current)
        setError("Could not change screenshot import. Check the folder and try again.");
      const next = await getScreenshotImportState().catch(() => null);
      if (mounted.current && next) setState(next);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <SettingsRow
      icon={Camera01Icon}
      title="Automatic screenshot import"
      description="Add new PNG, JPEG and WebP images from your screenshots folder. Off by default; existing files are left alone when enabled."
      action={null}
    >
      <fieldset
        disabled={!desktop || !state || busy}
        className="m-0 mt-3 min-w-0 border-0 p-0 disabled:opacity-42"
      >
        <legend className="sr-only">Automatic screenshot import</legend>
        <SegmentedControl
          className="w-fit max-w-full border border-[#221f1c] bg-surface"
          name="screenshot-import"
          label="Automatic screenshot import"
          value={state?.enabled ? "on" : "off"}
          options={[
            { value: "off", label: "Off" },
            { value: "on", label: "On" },
          ]}
          onChange={(value) => void change(() => setScreenshotImportEnabled(value === "on"))}
        />
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 break-all font-mono text-[11px]/[17px] text-muted">
            {state?.directory}
          </span>
          <button
            type="button"
            className={pillButton()}
            onClick={() => void change(chooseScreenshotImportDirectory)}
          >
            Choose folder
          </button>
        </div>
      </fieldset>
      <p role="status" className="mt-2 mb-0 font-body text-[12px]/[18px] text-muted">
        {error ??
          state?.message ??
          (!desktop
            ? "Open the desktop app to enable this."
            : busy
              ? "Saving screenshot settings…"
              : state?.enabled
                ? "Watching for new screenshots while inkling is open."
                : "No folder is watched while this is off.")}
      </p>
    </SettingsRow>
  );
}
