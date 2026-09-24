import browser from "webextension-polyfill";
import type { SaveStatus } from "./background";

const saveButton = document.getElementById("save") as HTMLButtonElement;
const statusLine = document.getElementById("status") as HTMLParagraphElement;

function renderStatus(status: SaveStatus | null): void {
  if (!status) {
    statusLine.textContent = "";
    return;
  }
  if (status.state === "saved") {
    statusLine.textContent = status.title ? `Saved “${status.title}”.` : "Saved.";
  } else if (status.state === "queued") {
    statusLine.textContent = `Inkling is unavailable — kept locally (${status.detail ?? "pending"}).`;
  } else {
    statusLine.textContent = `Couldn’t save: ${status.detail ?? "unknown error"}.`;
  }
}

async function refreshStatus(): Promise<void> {
  const stored = await browser.storage.local.get("inkling:last-save-status");
  renderStatus((stored["inkling:last-save-status"] as SaveStatus | undefined) ?? null);
}

saveButton.addEventListener("click", () => {
  saveButton.disabled = true;
  statusLine.textContent = "Saving…";
  browser.runtime
    .sendMessage({ type: "inkling:save-page" })
    .then((status) => renderStatus(status as SaveStatus | null))
    .catch((error: unknown) =>
      renderStatus({
        state: "failed",
        detail: error instanceof Error ? error.message : "unknown error",
        at: new Date().toISOString(),
      }),
    )
    .finally(() => {
      saveButton.disabled = false;
    });
});

void refreshStatus();
