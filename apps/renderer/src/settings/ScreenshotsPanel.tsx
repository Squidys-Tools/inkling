import { Camera01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import type { ScreenshotImportState } from "@inkling/contracts/desktop";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import { desktop } from "../desktop.ts";
import { Panel, PanelBody, SquareButton, Row, settingsText } from "./parts.tsx";

export function ScreenshotsPanel({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<ScreenshotImportState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    let live = true;
    const read = () => {
      if (active.current) return;
      desktop?.screenshots.state().then(
        (next) => {
          if (live && !active.current) {
            setState(next);
            setError(null);
          }
        },
        () => {
          if (live) setError("Couldn’t read screenshot import settings.");
        },
      );
    };
    read();
    const timer = setInterval(read, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  const change = async (choose: boolean) => {
    if (!desktop || active.current) return;
    active.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = choose
        ? await desktop.screenshots.chooseDirectory()
        : await desktop.screenshots.setEnabled(!state?.enabled);
      setState(next);
    } catch {
      setError("Couldn’t change screenshot import. Check the folder and try again.");
      setState(await desktop.screenshots.state().catch(() => null));
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  return (
    <Panel
      title="Screenshots"
      note="Only the folder you choose is watched. Import is off until you turn it on."
      onClose={onClose}
    >
      <PanelBody>
        <Row
          icon={Camera01Icon}
          title="Import new screenshots"
          description="New PNG, JPEG and WebP files are saved locally. Existing files are skipped when you turn it on."
          action={
            <SquareButton
              look={state?.enabled ? "solid" : "plain"}
              aria-pressed={state?.enabled ?? false}
              disabled={!desktop || !state || busy}
              onClick={() => void change(false)}
            >
              {state?.enabled ? "Turn off" : "Turn on"}
            </SquareButton>
          }
        >
          {!desktop && (
            <p {...stylex.props(settingsText.hint)}>Screenshot import needs the desktop app.</p>
          )}
          {state && (
            <p role="status" {...stylex.props(settingsText.status)}>
              {state.message ??
                (state.enabled
                  ? `Watching · ${state.imported} imported this session`
                  : "Off · nothing is being watched")}
            </p>
          )}
        </Row>
        <Row
          icon={Folder01Icon}
          title="Screenshots folder"
          description="Choose a dedicated screenshots folder, not your whole Pictures folder. Nothing is uploaded."
          action={
            <SquareButton disabled={!desktop || !state || busy} onClick={() => void change(true)}>
              Choose folder…
            </SquareButton>
          }
        >
          {state && <p {...stylex.props(settingsText.mono)}>{state.directory}</p>}
        </Row>
        {error && (
          <p role="alert" {...stylex.props(settingsText.status)}>
            {error}
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}
