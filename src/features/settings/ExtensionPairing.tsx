import { Link01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type CaptureStatus,
  getCaptureStatus,
  getPairingToken,
  isElectronRuntime,
  regeneratePairingToken,
} from "../../lib/libraryApi";
import { pillButton, SettingsEmptyState } from "./SettingsPanel";

// The token is never rendered until the user reveals it.
export function ExtensionPairing() {
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isConfirmingRenew, setIsConfirmingRenew] = useState(false);

  useEffect(() => {
    if (!isElectronRuntime()) return;
    void getCaptureStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!isElectronRuntime()) {
    return (
      <SettingsEmptyState icon={Link01Icon} title="Pairing needs the desktop app.">
        Open Settings in the installed app to pair the browser extension.
      </SettingsEmptyState>
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
    void navigator.clipboard
      .writeText(token)
      .then(() => toast.success("Pairing token copied. Paste it into the extension."))
      .catch(() =>
        toast.error("Copy failed. Reveal the token and copy it by hand.", { duration: 5000 }),
      );
  };

  const renewToken = () => {
    setIsConfirmingRenew(false);
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
      const bearer = token ?? (await getPairingToken());
      const response = await fetch(healthUrl, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    };
    void check()
      .then(() => toast.success("Extension receiver is reachable."))
      .catch(() =>
        toast.error("No answer from the receiver. Is the app running?", { duration: 5000 }),
      )
      .finally(() => setIsTesting(false));
  };

  const row = "flex flex-wrap items-center gap-2.5";
  return (
    <div className="flex max-w-[560px] flex-col gap-4">
      <p className="m-0 max-w-[460px] font-body text-[14px]/[21px] font-normal text-muted">
        Paste this token into the browser extension once. Saves go straight to this library over a
        local connection; nothing leaves the machine.
      </p>
      <div className={row}>
        <span className="font-body text-[12px]/4 font-normal text-muted" role="status">
          {status
            ? status.running
              ? `Listening on 127.0.0.1:${status.port}`
              : "Receiver not running"
            : "Checking receiver…"}
        </span>
        <button
          type="button"
          className={pillButton()}
          disabled={!status?.healthUrl || isTesting}
          onClick={testConnection}
        >
          {isTesting ? "Testing…" : "Test connection"}
        </button>
      </div>
      <div className={row}>
        <span className="sr-only">{isRevealed ? "Pairing token" : "Pairing token hidden"}</span>
        <code
          className="min-w-0 flex-[1_1_220px] overflow-hidden rounded-[10px] border border-[#221f1c] bg-surface px-3 py-[9px] font-mono text-[12px]/4 font-normal tracking-[0.02em] text-ellipsis whitespace-nowrap text-ink-soft"
          aria-hidden={!isRevealed}
        >
          {isRevealed && token ? token : "••••••••••••••••••••••••"}
        </code>
        <button type="button" className={pillButton()} onClick={revealToken}>
          {isRevealed ? "Hide" : "Reveal"}
        </button>
        <button
          type="button"
          className={pillButton()}
          disabled={!isRevealed || !token}
          onClick={copyToken}
        >
          Copy
        </button>
        <button
          type="button"
          className={pillButton("danger")}
          onClick={() => setIsConfirmingRenew(true)}
        >
          Renew
        </button>
      </div>
      {isConfirmingRenew && (
        <section
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-frame border border-[#221f1c] bg-[#171513] px-4 py-3.5"
          aria-label="Renew the pairing token"
        >
          <p className="m-0 font-body text-[13px]/[19px] font-normal text-ink-soft">
            Renew the pairing token? The extension will need the new token.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={pillButton()}
              onClick={() => setIsConfirmingRenew(false)}
            >
              Cancel
            </button>
            <button type="button" className={pillButton("danger")} onClick={renewToken}>
              Renew
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
