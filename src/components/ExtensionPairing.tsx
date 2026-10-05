import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import {
  getCaptureStatus,
  getPairingToken,
  isTauriRuntime,
  regeneratePairingToken,
  type CaptureStatus,
} from "../lib/libraryApi";
import { SETTINGS_BATCH_BUTTON_CLASS } from "./settingsClasses";

// Pairing panel inside the existing Settings modal. Shows the per-install
// pairing token for the browser extension (reveal-on-click, never rendered
// by default) with copy, renew, and a live check against /v1/health.
export function ExtensionPairing() {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    void getCaptureStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!isTauriRuntime()) {
    return (
      <div className="grid min-h-[260px] place-items-center content-center rounded-2xl border border-dashed border-rule p-[40px_24px] text-center">
        <div className="mb-3.5 grid size-[42px] place-items-center rounded-full bg-surface-strong text-muted"><HugeiconsIcon icon={Link01Icon} size={19} /></div>
        <h4 className="m-0 font-sans text-[17px] font-medium leading-[1.2] text-ink">Pairing needs the desktop app.</h4>
        <p className="mt-2 mb-0 max-w-[32ch] text-[12px] leading-[1.5] text-muted">Open Settings in the installed app to pair the browser extension.</p>
      </div>
    );
  }

  const revealToken = () => {
    if (isRevealed) {
      setIsRevealed(false);
      setToken(null);
      return;
    }
    void getPairingToken()
      .then((value) => {
        setToken(value);
        setIsRevealed(true);
      })
      .catch(() => toast.error("Could not load the pairing token.", { duration: 5000 }));
  };

  const copyToken = () => {
    if (!token) return;
    void navigator.clipboard.writeText(token)
      .then(() => toast.success("Pairing token copied. Paste it into the extension."))
      .catch(() => toast.error("Copy failed. Reveal the token and copy it by hand.", { duration: 5000 }));
  };

  const renewToken = () => {
    if (!window.confirm("Renew the pairing token? The extension will need the new token.")) return;
    void regeneratePairingToken()
      .then((value) => {
        setToken(value);
        setIsRevealed(true);
        toast.success("New pairing token issued. Update the extension.");
      })
      .catch(() => toast.error("Could not renew the pairing token.", { duration: 5000 }));
  };

  const testConnection = () => {
    const healthUrl = status?.healthUrl;
    if (!healthUrl || isTesting) return;
    setIsTesting(true);
    const check = async () => {
      const bearer = token ?? await getPairingToken();
      const response = await fetch(healthUrl, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    };
    void check()
      .then(() => toast.success("Extension receiver is reachable."))
      .catch(() => toast.error("No answer from the receiver. Is the app running?", { duration: 5000 }))
      .finally(() => setIsTesting(false));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "22px 2px" }}>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 12, lineHeight: 1.6, maxWidth: "52ch" }}>
        Paste this token into the browser extension once. Saves go straight to this library
        over a local connection; nothing leaves the machine.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="font-mono text-[10px] text-muted" role="status">
          {status ? (status.running ? `Listening on 127.0.0.1:${status.port}` : "Receiver not running") : "Checking receiver…"}
        </span>
        <button
          type="button"
          className={SETTINGS_BATCH_BUTTON_CLASS}
          disabled={!status?.healthUrl || isTesting}
          onClick={testConnection}
        >
          {isTesting ? "Testing…" : "Test connection"}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <code
          aria-label={isRevealed ? "Pairing token" : "Pairing token hidden"}
          style={{
            flex: "1 1 220px",
            padding: "9px 12px",
            border: "1px solid var(--rule)",
            borderRadius: 10,
            background: "var(--surface-strong)",
            color: "var(--ink)",
            font: "12px 'DM Mono', monospace",
            letterSpacing: "0.02em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {isRevealed && token ? token : "••••••••••••••••••••••••"}
        </code>
        <button type="button" className={SETTINGS_BATCH_BUTTON_CLASS} onClick={revealToken}>
          {isRevealed ? "Hide" : "Reveal"}
        </button>
        <button type="button" className={SETTINGS_BATCH_BUTTON_CLASS} disabled={!isRevealed || !token} onClick={copyToken}>
          Copy
        </button>
        <button type="button" className={SETTINGS_BATCH_BUTTON_CLASS + " bg-orange-soft text-orange hover:border-orange"} onClick={renewToken}>
          Renew
        </button>
      </div>
    </div>
  );
}