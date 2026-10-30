import browser from "webextension-polyfill";
import {
  BASE_URL_KEY,
  isPairingToken,
  normalizeCaptureServerAddress,
  TOKEN_KEY,
} from "./connection";

const baseUrlInput = document.getElementById("base-url") as HTMLInputElement;
const tokenInput = document.getElementById("token") as HTMLInputElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const statusLine = document.getElementById("status") as HTMLSpanElement;

async function load(): Promise<void> {
  const stored = await browser.storage.local.get([BASE_URL_KEY, TOKEN_KEY]);
  if (typeof stored[BASE_URL_KEY] === "string") baseUrlInput.value = stored[BASE_URL_KEY];
  if (typeof stored[TOKEN_KEY] === "string") tokenInput.value = stored[TOKEN_KEY];
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

    await browser.storage.local.set({ [BASE_URL_KEY]: baseUrl, [TOKEN_KEY]: token });
    statusLine.textContent = "Saved.";
  })();
});

void load();
