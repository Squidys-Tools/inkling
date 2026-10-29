import browser from "webextension-polyfill";
import { isPairingToken, normalizeCaptureServerAddress } from "./connection";

const baseUrlInput = document.getElementById("base-url") as HTMLInputElement;
const tokenInput = document.getElementById("token") as HTMLInputElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const statusLine = document.getElementById("status") as HTMLSpanElement;

async function load(): Promise<void> {
  const stored = await browser.storage.local.get(["inkling.base-url", "inkling.token"]);
  if (typeof stored["inkling.base-url"] === "string") {
    baseUrlInput.value = stored["inkling.base-url"];
  }
  if (typeof stored["inkling.token"] === "string") {
    tokenInput.value = stored["inkling.token"];
  }
}

saveButton.addEventListener("click", () => {
  void (async () => {
    const enteredAddress = baseUrlInput.value.trim();
    const normalizedAddress = enteredAddress.includes("://")
      ? enteredAddress
      : `http://${enteredAddress}`;
    const baseUrl = normalizeCaptureServerAddress(normalizedAddress);
    if (!baseUrl) {
      statusLine.textContent =
        "Enter the 127.0.0.1 address shown in inkling Settings → Browser extension.";
      return;
    }

    const token = tokenInput.value.trim();
    if (!isPairingToken(token)) {
      statusLine.textContent = "Enter the pairing token from inkling Settings → Browser extension.";
      return;
    }

    await browser.storage.local.set({
      "inkling.base-url": baseUrl,
      "inkling.token": token,
    });
    statusLine.textContent = "Saved.";
  })();
});

void load();
