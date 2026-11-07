import Link01Icon from "@hugeicons/core-free-icons/Link01Icon";
import type { DesktopBridge } from "@inkling/contracts/desktop";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { desktop } from "../desktop.ts";
import { EmptyState, Panel, PanelBody, settingsText, SquareButton, TextAction } from "./parts.tsx";

const tokenKey = ["pairingToken"];

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

// The token stays out of the page until the user reveals it, and out of the
// query cache once it is hidden again or the panel closes.
function Pairing({ capture }: { capture: DesktopBridge["capture"] }) {
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState(false);
  const [confirmingRenew, setConfirmingRenew] = useState(false);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const receiver = useQuery({ queryKey: ["captureReceiver"], queryFn: () => capture.receiver() });
  const tokenQuery = useQuery({
    queryKey: tokenKey,
    queryFn: () => capture.pairingToken(),
    enabled: revealed,
    staleTime: Infinity,
    gcTime: 0,
  });
  const hide = () => {
    setRevealed(false);
    queryClient.removeQueries({ queryKey: tokenKey });
  };
  const token = revealed ? tokenQuery.data : undefined;
  const test = useMutation({
    mutationFn: () => capture.testReceiver().catch(() => false),
    onSuccess: (reachable) =>
      setNotice(
        reachable
          ? { text: "Extension receiver is reachable.", failed: false }
          : { text: "No answer from the receiver. Restart inkling and try again.", failed: true },
      ),
  });
  const renew = useMutation({ mutationFn: () => capture.regeneratePairingToken() });

  const copy = () => {
    if (!token) return;
    navigator.clipboard.writeText(token).then(
      () =>
        setNotice({ text: "Pairing token copied. Paste it into the extension.", failed: false }),
      () => setNotice({ text: "Copy failed. Reveal the token and copy it by hand.", failed: true }),
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
          {receiver.isPending
            ? "Checking receiver…"
            : receiver.data?.running
              ? `Listening on 127.0.0.1:${receiver.data.port}`
              : "Receiver not running"}
        </p>
        <SquareButton
          disabled={!receiver.data?.running || test.isPending}
          onClick={() => test.mutate()}
        >
          {test.isPending ? "Testing…" : "Test connection"}
        </SquareButton>
      </div>
      <div {...stylex.props(styles.row)}>
        <span {...stylex.props(styles.visuallyHidden)}>
          {token ? "Pairing token" : "Pairing token hidden"}
        </span>
        <code aria-hidden={!token} {...stylex.props(styles.token)}>
          {token ?? "••••••••••••••••••••••••"}
        </code>
        <SquareButton
          onClick={() =>
            token ? hide() : revealed ? void tokenQuery.refetch() : setRevealed(true)
          }
        >
          {token ? "Hide" : "Reveal"}
        </SquareButton>
        <SquareButton disabled={!token} onClick={copy}>
          Copy
        </SquareButton>
        <SquareButton look="danger" onClick={() => setConfirmingRenew(true)}>
          Renew
        </SquareButton>
      </div>
      {revealed && tokenQuery.isError && (
        <p role="alert" {...stylex.props(styles.failed)}>
          Could not load the pairing token.
        </p>
      )}
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
            <TextAction onClick={() => setConfirmingRenew(false)}>Cancel</TextAction>
            <SquareButton
              look="danger"
              onClick={() => {
                setConfirmingRenew(false);
                // Per-call callbacks skip a closed panel, so the token never lands in a cache nobody clears.
                renew.mutate(undefined, {
                  onSuccess: (value) => {
                    queryClient.setQueryData(tokenKey, value);
                    setRevealed(true);
                    setNotice({
                      text: "New pairing token issued. Update the extension.",
                      failed: false,
                    });
                  },
                  onError: () =>
                    setNotice({ text: "Could not renew the pairing token.", failed: true }),
                });
              }}
            >
              Renew
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
