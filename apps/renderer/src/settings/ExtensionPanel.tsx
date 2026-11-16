import BrowserIcon from "@hugeicons/core-free-icons/BrowserIcon";
import DropletIcon from "@hugeicons/core-free-icons/DropletIcon";
import FlashIcon from "@hugeicons/core-free-icons/FlashIcon";
import Link01Icon from "@hugeicons/core-free-icons/Link01Icon";
import Unlink03Icon from "@hugeicons/core-free-icons/Unlink03Icon";
import { captureReceiverPorts } from "@inkling/contracts/capture";
import type { DesktopBridge } from "@inkling/contracts/desktop";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { desktop } from "../desktop.ts";
import {
  ActionButton,
  Card,
  CardRow,
  EmptyState,
  Flow,
  FlowLink,
  FlowNode,
  Panel,
  PanelBody,
  Section,
  settingsText,
  TextAction,
} from "./parts.tsx";

export function ExtensionPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel
      title="Browser extension"
      note="Save pages without leaving the browser."
      onClose={onClose}
    >
      <PanelBody>
        {desktop ? (
          <Pairing capture={desktop.capture} />
        ) : (
          <EmptyState icon={Link01Icon} title="Pairing needs the desktop app.">
            Open Settings in the installed app to pair the browser extension.
          </EmptyState>
        )}
      </PanelBody>
    </Panel>
  );
}

function Pairing({ capture }: { capture: DesktopBridge["capture"] }) {
  const [confirmingRenew, setConfirmingRenew] = useState(false);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const receiver = useQuery({ queryKey: ["captureReceiver"], queryFn: () => capture.receiver() });
  const test = useMutation({
    mutationFn: () => capture.testReceiver().catch(() => false),
    onSuccess: (reachable) =>
      setNotice(
        reachable
          ? { text: "Extension receiver is reachable.", failed: false }
          : { text: "No answer from the receiver. Restart inkling and try again.", failed: true },
      ),
  });
  const renew = useMutation({
    mutationFn: () => capture.regeneratePairingToken(),
    onSuccess: () =>
      setNotice({ text: "Disconnected. Press Connect in the extension again.", failed: false }),
    onError: () => setNotice({ text: "Could not disconnect the browsers.", failed: true }),
  });
  const port = receiver.data?.running ? receiver.data.port : null;
  const state: keyof typeof linkLabel = receiver.isPending
    ? "waiting"
    : port === null
      ? "off"
      : captureReceiverPorts.includes(port)
        ? "on"
        : "busy";

  return (
    <>
      <Card>
        <Flow>
          <FlowNode icon={BrowserIcon} title="Your browser" detail="Chrome, Edge, Arc or Brave" />
          <FlowLink tone={linkTone[state]} label={linkLabel[state]} />
          <FlowNode
            icon={DropletIcon}
            title="inkling"
            detail={port === null ? "Not listening" : `127.0.0.1:${port}`}
            strong
          />
        </Flow>
        <CardRow
          title="Connection"
          description={
            <span role="status">
              {state === "on"
                ? `Listening on 127.0.0.1:${port}. Nothing is sent anywhere else.`
                : status[state]}
            </span>
          }
          action={
            <div {...stylex.props(styles.actions)}>
              <ActionButton
                icon={FlashIcon}
                disabled={port === null || test.isPending}
                onClick={() => test.mutate()}
              >
                {test.isPending ? "Testing…" : "Test connection"}
              </ActionButton>
              <ActionButton
                icon={Unlink03Icon}
                look="danger"
                onClick={() => setConfirmingRenew(true)}
              >
                Disconnect browsers
              </ActionButton>
            </div>
          }
        >
          {notice && (
            <p
              role={notice.failed ? "alert" : "status"}
              {...stylex.props(notice.failed ? styles.failed : settingsText.status)}
            >
              {notice.text}
            </p>
          )}
        </CardRow>
      </Card>
      {confirmingRenew && (
        <section aria-label="Disconnect every browser" {...stylex.props(styles.confirm)}>
          <p {...stylex.props(settingsText.status)}>
            Disconnect every browser? Each one will need to connect again.
          </p>
          <div {...stylex.props(styles.actions)}>
            <TextAction onClick={() => setConfirmingRenew(false)}>Cancel</TextAction>
            <ActionButton
              look="danger"
              onClick={() => {
                setConfirmingRenew(false);
                renew.mutate();
              }}
            >
              Disconnect
            </ActionButton>
          </div>
        </section>
      )}
      <Section label="Add a browser">
        <CardRow
          title="Press Connect in the extension, then allow it here"
          description="Each browser connects once. Saves go straight to this library."
        />
      </Section>
    </>
  );
}

const linkLabel = {
  waiting: "checking…",
  on: "listening · stays on this computer",
  off: "receiver not running",
  busy: "ports taken",
};

const status = {
  waiting: "Checking the receiver…",
  on: "",
  off: "The receiver isn’t running, so the extension can’t reach inkling.",
  busy: "Other programs hold the ports the extension looks for, so its saves open inkling instead.",
};

const linkTone = {
  waiting: "muted",
  on: "success",
  off: "danger",
  busy: "accent",
} as const;

const styles = stylex.create({
  actions: { display: "flex", flexShrink: 0, gap: space.s2 },
  failed: {
    margin: 0,
    fontFamily: font.body,
    fontSize: text.md,
    lineHeight: "19px",
    color: color.danger,
  },
  confirm: {
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: space.s4,
    rowGap: space.s3,
    marginTop: space.s3,
    paddingInline: space.s4,
    paddingBlock: "14px",
    borderRadius: radius.tile,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.danger,
    backgroundColor: color.dangerSoft,
  },
});
