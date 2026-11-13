import Link01Icon from "@hugeicons/core-free-icons/Link01Icon";
import { captureReceiverPorts } from "@inkling/contracts/capture";
import type { DesktopBridge } from "@inkling/contracts/desktop";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { desktop } from "../desktop.ts";
import { EmptyState, Panel, PanelBody, settingsText, SquareButton, TextAction } from "./parts.tsx";

export function ExtensionPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel
      title="Browser extension"
      note="Save pages without leaving the browser"
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

  return (
    <div {...stylex.props(styles.pairing)}>
      <p {...stylex.props(styles.lead)}>
        Press Connect in the browser extension, then allow it here. Saves go straight to this
        library over a local connection; nothing leaves the machine.
      </p>
      <div {...stylex.props(styles.row)}>
        <p role="status" {...stylex.props(settingsText.hint)}>
          {receiver.isPending
            ? "Checking receiver…"
            : port === null
              ? "Receiver not running"
              : captureReceiverPorts.includes(port)
                ? `Listening on 127.0.0.1:${port}`
                : "Other programs hold the ports the extension looks for, so its saves open inkling instead."}
        </p>
        <SquareButton disabled={port === null || test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? "Testing…" : "Test connection"}
        </SquareButton>
        <SquareButton look="danger" onClick={() => setConfirmingRenew(true)}>
          Disconnect browsers
        </SquareButton>
      </div>
      {notice && (
        <p
          role={notice.failed ? "alert" : "status"}
          {...stylex.props(notice.failed ? styles.failed : settingsText.status)}
        >
          {notice.text}
        </p>
      )}
      {confirmingRenew && (
        <section aria-label="Disconnect every browser" {...stylex.props(styles.confirm)}>
          <p {...stylex.props(settingsText.status)}>
            Disconnect every browser? Each one will need to connect again.
          </p>
          <div {...stylex.props(styles.confirmActions)}>
            <TextAction onClick={() => setConfirmingRenew(false)}>Cancel</TextAction>
            <SquareButton
              look="danger"
              onClick={() => {
                setConfirmingRenew(false);
                renew.mutate();
              }}
            >
              Disconnect
            </SquareButton>
          </div>
        </section>
      )}
    </div>
  );
}

const styles = stylex.create({
  pairing: { display: "flex", flexDirection: "column", gap: space.s4, maxWidth: "560px" },
  lead: {
    margin: 0,
    maxWidth: "460px",
    fontFamily: font.body,
    fontSize: "14px",
    lineHeight: "21px",
    color: color.muted,
  },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" },
  failed: {
    margin: 0,
    fontFamily: font.body,
    fontSize: text.md,
    lineHeight: "19px",
    color: color.danger,
  },
  confirm: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: space.s4,
    rowGap: space.s3,
    paddingInline: space.s4,
    paddingBlock: "14px",
    borderRadius: radius.frame,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  confirmActions: { display: "flex", gap: space.s2 },
});
