import Camera01Icon from "@hugeicons/core-free-icons/Camera01Icon";
import Folder01Icon from "@hugeicons/core-free-icons/Folder01Icon";
import type { ScreenshotImportState } from "@inkling/contracts/desktop";
import * as stylex from "@stylexjs/stylex";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { desktop } from "../desktop.ts";
import { Panel, PanelBody, SquareButton, Row, settingsText } from "./parts.tsx";

const screenshotsKey = ["screenshots"];

export function ScreenshotsPanel({ onClose }: { onClose: () => void }) {
  const bridge = desktop?.screenshots;
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (apply: () => Promise<ScreenshotImportState>) => apply(),
    // A poll that started before the change would otherwise land after it.
    onMutate: () => queryClient.cancelQueries({ queryKey: screenshotsKey }),
    onSuccess: (next) => queryClient.setQueryData(screenshotsKey, next),
    onError: () => queryClient.invalidateQueries({ queryKey: screenshotsKey }),
  });
  const read = useQuery({
    queryKey: screenshotsKey,
    queryFn: bridge ? () => bridge.state() : skipToken,
    refetchInterval: change.isPending ? false : 2000,
  });
  const state = read.data;
  const error = change.isError
    ? "Couldn’t change screenshot import. Check the folder and try again."
    : read.isError
      ? "Couldn’t read screenshot import settings."
      : null;
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
              disabled={!state || change.isPending}
              onClick={() =>
                bridge && state && change.mutate(() => bridge.setEnabled(!state.enabled))
              }
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
            <SquareButton
              disabled={!state || change.isPending}
              onClick={() => bridge && change.mutate(() => bridge.chooseDirectory())}
            >
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
