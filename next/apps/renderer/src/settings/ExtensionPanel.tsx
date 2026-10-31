import { Link01Icon } from "@hugeicons/core-free-icons";
import type { CaptureReceiver, DesktopBridge } from "@inkling/contracts/desktop";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useEffect, useState } from "react";
import { desktop } from "../desktop.ts";
import { EmptyState, Panel, PanelBody, Pill, settingsText } from "./parts.tsx";

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

// The token stays out of the page until the user reveals it.
function Pairing({ capture }: { capture: DesktopBridge["capture"] }) {
  const [receiver, setReceiver] = useState<CaptureReceiver | "unknown" | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [confirmingRenew, setConfirmingRenew] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);

  useEffect(() => {
    let current = true;
    capture.receiver().then(
      (status) => current && setReceiver(status),
      () => current && setReceiver("unknown"),
    );
    return () => {
      current = false;
    };
  }, [capture]);

  const reveal = () => {
    if (token) return setToken(null);
    capture
      .pairingToken()
      .then(setToken, () => setNotice({ text: "Could not load the pairing token.", failed: true }));
  };
  const copy = () => {
    if (!token) return;
    navigator.clipboard.writeText(token).then(
      () =>
        setNotice({ text: "Pairing token copied. Paste it into the extension.", failed: false }),
      () => setNotice({ text: "Copy failed. Reveal the token and copy it by hand.", failed: true }),
    );
  };
  const test = () => {
    setTesting(true);
    capture
      .testReceiver()
      .catch(() => false)
      .then((reachable) => {
        setTesting(false);
        setNotice(
          reachable
            ? { text: "Extension receiver is reachable.", failed: false }
            : { text: "No answer from the receiver. Restart inkling and try again.", failed: true },
        );
      });
  };
  const renew = () => {
    setConfirmingRenew(false);
    capture.regeneratePairingToken().then(
      (value) => {
        setToken(value);
        setNotice({ text: "New pairing token issued. Update the extension.", failed: false });
      },
      () => setNotice({ text: "Could not renew the pairing token.", failed: true }),
    );
  };

  return (
    <div {...stylex.props(styles.pairing)}>
      <p {...stylex.props(styles.lead)}>
        Paste this token into the browser extension once. Saves go straight to this library over a
        local connection; nothing leaves the machine.
      </p>
      <div {...stylex.props(styles.row)}>
        <p role="status" {...stylex.props(settingsText.hint)}>
          {receiver === null
            ? "Checking receiver…"
            : receiver === "unknown" || !receiver.running
              ? "Receiver not running"
              : `Listening on 127.0.0.1:${receiver.port}`}
        </p>
        <Pill
          disabled={receiver === null || receiver === "unknown" || !receiver.running || testing}
          onClick={test}
        >
          {testing ? "Testing…" : "Test connection"}
        </Pill>
      </div>
      <div {...stylex.props(styles.row)}>
        <span {...stylex.props(styles.visuallyHidden)}>
          {token ? "Pairing token" : "Pairing token hidden"}
        </span>
        <code aria-hidden={!token} {...stylex.props(styles.token)}>
          {token ?? "••••••••••••••••••••••••"}
        </code>
        <Pill onClick={reveal}>{token ? "Hide" : "Reveal"}</Pill>
        <Pill disabled={!token} onClick={copy}>
          Copy
        </Pill>
        <Pill look="danger" onClick={() => setConfirmingRenew(true)}>
          Renew
        </Pill>
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
        <section aria-label="Renew the pairing token" {...stylex.props(styles.confirm)}>
          <p {...stylex.props(settingsText.status)}>
            Renew the pairing token? The extension will need the new token.
          </p>
          <div {...stylex.props(styles.confirmActions)}>
            <Pill onClick={() => setConfirmingRenew(false)}>Cancel</Pill>
            <Pill look="danger" onClick={renew}>
              Renew
            </Pill>
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
  token: {
    flex: "1 1 220px",
    minWidth: 0,
    overflow: "hidden",
    paddingInline: space.s3,
    paddingBlock: "9px",
    borderRadius: "10px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.surface,
    fontFamily: font.mono,
    fontSize: text.sm,
    lineHeight: "16px",
    letterSpacing: "0.02em",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: color.inkSoft,
  },
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
  visuallyHidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  },
});
