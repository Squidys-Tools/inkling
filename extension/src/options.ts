import browser from "webextension-polyfill";
import { PORT_KEY, portsToTry, TOKEN_KEY } from "./connection";
import { locateReceiver } from "./deliver";
import { pairingAnswer, requestPairing } from "./transport";

const connectButton = document.getElementById("connect") as HTMLButtonElement;
const disconnectButton = document.getElementById("disconnect") as HTMLButtonElement;
const statusLine = document.getElementById("status") as HTMLParagraphElement;

const show = (text: string, connected: boolean) => {
  statusLine.textContent = text;
  connectButton.hidden = connected;
  disconnectButton.hidden = !connected;
};

async function showCurrent() {
  const { state } = await locateReceiver();
  if (state === "connected") show("Connected to inkling.", true);
  else if (state === "silent") show("Connected. inkling isn't running right now.", true);
  else if (state === "refused") show("inkling disconnected this browser. Connect again.", false);
  else show("Not connected. Saves open the inkling app instead.", false);
}

// This page, not the popup, waits for the answer: the popup closes when the app comes forward.
async function connect() {
  connectButton.disabled = true;
  try {
    const request = await requestPairing(portsToTry(null));
    if (!request) {
      show("inkling didn't answer. Open inkling, then press Connect again.", false);
      return;
    }
    show("inkling is asking you to allow this. Choose Connect there.", false);
    let answer = await pairingAnswer(request.port, request.id);
    while (answer.status === "pending") {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      answer = await pairingAnswer(request.port, request.id);
    }
    if (answer.status !== "approved") {
      show("inkling didn't allow the connection. Press Connect to ask again.", false);
      return;
    }
    await browser.storage.local.set({ [TOKEN_KEY]: answer.token, [PORT_KEY]: request.port });
    show("Connected to inkling.", true);
  } finally {
    connectButton.disabled = false;
  }
}

async function disconnect() {
  await browser.storage.local.remove([TOKEN_KEY, PORT_KEY]);
  await showCurrent();
}

connectButton.addEventListener("click", () => void connect());
disconnectButton.addEventListener("click", () => void disconnect());
void showCurrent();
