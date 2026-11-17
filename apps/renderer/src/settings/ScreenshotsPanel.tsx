import Camera01Icon from "@hugeicons/core-free-icons/Camera01Icon";
import DropletIcon from "@hugeicons/core-free-icons/DropletIcon";
import Folder01Icon from "@hugeicons/core-free-icons/Folder01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ScreenshotImportState } from "@inkling/contracts/desktop";
import { SegmentedControl } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { desktop } from "../desktop.ts";
import {
  ActionButton,
  Card,
  CardRow,
  EmptyState,
  Flow,
  FlowLink,
  FlowNode,
  inset,
  Panel,
  PanelBody,
  Section,
  settingsText,
} from "./parts.tsx";

const screenshotsKey = ["screenshots"];
const importOptions = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
] as const;

const folderName = (path: string) => path.split(/[\\/]/u).findLast(Boolean) ?? path;

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
  const busy = !state || change.isPending;

  return (
    <Panel
      title="Screenshots"
      note="New screenshots in one folder save themselves. Only that folder is watched, and nothing is uploaded."
      onClose={onClose}
    >
      <PanelBody>
        {!bridge ? (
          <EmptyState icon={Camera01Icon} title="Screenshot import needs the desktop app.">
            Open Settings in the installed app to watch a screenshots folder.
          </EmptyState>
        ) : (
          <>
            <Card>
              <Flow>
                <FlowNode
                  icon={Folder01Icon}
                  title={state ? folderName(state.directory) : "Your folder"}
                  detail={state?.directory ?? "…"}
                  mono
                />
                <FlowLink
                  tone={state?.enabled ? "success" : "muted"}
                  label={
                    state?.enabled
                      ? `watching · ${state.imported} saved this session`
                      : "off · nothing is watched"
                  }
                />
                <FlowNode icon={DropletIcon} title="inkling" detail="PNG, JPEG and WebP" strong />
              </Flow>
              <CardRow
                title="Import new screenshots"
                description="Files already in the folder are skipped when you turn it on."
                action={
                  <SegmentedControl
                    name="screenshots-import"
                    label="Import new screenshots"
                    options={importOptions}
                    value={state?.enabled ? "on" : "off"}
                    disabled={busy}
                    onChange={(value) => change.mutate(() => bridge.setEnabled(value === "on"))}
                    style={[inset.capsule, inset.onCard, styles.segmented]}
                  />
                }
              >
                {(state?.message ?? error) && (
                  <p role={error ? "alert" : "status"} {...stylex.props(settingsText.status)}>
                    {error ?? state?.message}
                  </p>
                )}
              </CardRow>
            </Card>
            <Section label="Folder">
              <div {...stylex.props(styles.folderRow)}>
                <span title={state?.directory} {...stylex.props(styles.field)}>
                  <HugeiconsIcon icon={Folder01Icon} size={15} />
                  <span {...stylex.props(styles.path)}>{state?.directory ?? "…"}</span>
                </span>
                <ActionButton
                  disabled={busy}
                  onClick={() => change.mutate(() => bridge.chooseDirectory())}
                >
                  Change…
                </ActionButton>
              </div>
            </Section>
            <p {...stylex.props(settingsText.hint, styles.hint)}>
              Pick a folder that only holds screenshots, not your whole Pictures folder.
            </p>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

const styles = stylex.create({
  segmented: { flexShrink: 0 },
  folderRow: {
    display: "flex",
    alignItems: "center",
    gap: space.s3,
    paddingInline: space.s4,
    paddingBlock: "14px",
  },
  field: {
    display: "flex",
    flex: "1 1 auto",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
    height: "38px",
    paddingInline: space.s3,
    borderRadius: radius.control,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.sunken,
    color: color.muted,
  },
  path: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.mono,
    fontSize: text.sm,
    color: color.inkSoft,
  },
  hint: { marginTop: space.s2, marginInline: "2px", color: color.faint },
});
