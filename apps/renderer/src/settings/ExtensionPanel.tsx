import BrowserIcon from "@hugeicons/core-free-icons/BrowserIcon";
import DropletIcon from "@hugeicons/core-free-icons/DropletIcon";
import FlashIcon from "@hugeicons/core-free-icons/FlashIcon";
import Link01Icon from "@hugeicons/core-free-icons/Link01Icon";
import Unlink03Icon from "@hugeicons/core-free-icons/Unlink03Icon";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
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
  const state: keyof typeof links = receiver.isPending
    ? "waiting"
    : port === null
      ? "off"
      : captureReceiverPorts.includes(port)
        ? "on"
        : "busy";

  return (
    <>
      <Card>
        <div {...stylex.props(styles.flow)}>
          <Node icon={BrowserIcon} title="Your browser" detail="Chrome, Edge, Arc or Brave" />
          <div aria-hidden="true" {...stylex.props(styles.link, links[state])}>
            <span {...stylex.props(styles.linkLabel, labels[state])}>{linkLabel[state]}</span>
          </div>
          <Node
            icon={DropletIcon}
            title="inkling"
            detail={port === null ? "Not listening" : `127.0.0.1:${port}`}
            strong
          />
        </div>
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

function Node({
  icon,
  title,
  detail,
  strong,
}: {
  icon: IconSvgElement;
  title: string;
  detail: string;
  strong?: boolean;
}) {
  return (
    <div {...stylex.props(styles.node)}>
      <span aria-hidden="true" {...stylex.props(styles.nodeIcon, strong && styles.nodeIconStrong)}>
        <HugeiconsIcon icon={icon} size={26} />
      </span>
      <span {...stylex.props(styles.nodeTitle)}>{title}</span>
      <span {...stylex.props(styles.nodeDetail)}>{detail}</span>
    </div>
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

const links = stylex.create({
  waiting: {
    backgroundImage: `repeating-linear-gradient(90deg, ${color.borderStrong} 0 6px, transparent 6px 11px)`,
  },
  on: {
    backgroundImage: `repeating-linear-gradient(90deg, ${color.success} 0 6px, transparent 6px 11px)`,
  },
  off: {
    backgroundImage: `repeating-linear-gradient(90deg, ${color.danger} 0 6px, transparent 6px 11px)`,
    opacity: 0.6,
  },
  busy: {
    backgroundImage: `repeating-linear-gradient(90deg, ${color.accent} 0 6px, transparent 6px 11px)`,
  },
});

const labels = stylex.create({
  waiting: { color: color.muted },
  on: { color: color.success },
  off: { color: color.danger },
  busy: { color: color.accentStrong },
});

const styles = stylex.create({
  flow: {
    display: "flex",
    alignItems: "flex-start",
    paddingInline: "28px",
    paddingBlock: "26px",
  },
  node: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    flexShrink: 0,
    width: "160px",
    textAlign: "center",
  },
  nodeIcon: {
    display: "grid",
    placeItems: "center",
    width: "56px",
    height: "56px",
    marginBottom: space.s2,
    borderRadius: radius.frame,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    backgroundColor: color.raised,
    color: color.inkSoft,
  },
  nodeIconStrong: { color: color.ink },
  nodeTitle: {
    fontFamily: font.body,
    fontSize: "12.5px",
    lineHeight: "17px",
    fontWeight: 500,
    color: color.ink,
  },
  nodeDetail: {
    fontFamily: font.body,
    fontSize: "11.5px",
    lineHeight: "16px",
    color: color.muted,
  },
  link: {
    position: "relative",
    flex: "1 1 auto",
    minWidth: "60px",
    height: "2px",
    // Level with the middle of the 56px node icons.
    marginTop: "27px",
  },
  linkLabel: {
    position: "absolute",
    left: "50%",
    top: "-22px",
    transform: "translateX(-50%)",
    paddingInline: "6px",
    backgroundColor: color.surface,
    fontFamily: font.mono,
    fontSize: text.xs,
    lineHeight: "14px",
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
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
