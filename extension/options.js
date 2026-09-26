// inkling options: pairing fields wired to chrome.storage.local.
// Both values come from the app's Settings → Extension panel. The token never
// leaves the machine except to the app on loopback (127.0.0.1). No analytics,
// no remote calls.
//
// NOTE: Safari is deferred — no Safari target in this phase. When a Safari
// port happens it needs a separate Xcode / Web Extensions target outside
// this manifest set; do not shoehorn it into the Chrome/Firefox manifests.

/** @type {any} */
const optionsGlobal = globalThis;
const optionsApi = optionsGlobal.chrome ?? optionsGlobal.browser;

const baseUrlEl = /** @type {HTMLInputElement | null} */ (document.getElementById("base-url"));
const tokenEl = /** @type {HTMLInputElement | null} */ (document.getElementById("token"));
const saveEl = document.getElementById("save");
const savedEl = document.getElementById("saved");
const storageStatusEl = document.getElementById("storage-status");
const extensionIdEl = document.getElementById("extension-id");

function setStorageStatus(message, isError = false) {
  if (!storageStatusEl) return;
  storageStatusEl.textContent = message;
  storageStatusEl.style.color = isError ? "#b42318" : "";
}

async function load() {
  if (!optionsApi?.storage?.local || !optionsApi?.runtime?.id) {
    setStorageStatus("Extension storage is unavailable. Open this page from the extension's Options link, not as a file.", true);
    return;
  }
  extensionIdEl.textContent = optionsApi.runtime.id;
  try {
    const stored = await optionsApi.storage.local.get(["inkling.base-url", "inkling.token"]);
    const hasAddress = typeof stored["inkling.base-url"] === "string" && stored["inkling.base-url"].length > 0;
    const hasToken = typeof stored["inkling.token"] === "string" && stored["inkling.token"].length > 0;
    if (hasAddress) baseUrlEl.value = stored["inkling.base-url"];
    if (hasToken) tokenEl.value = stored["inkling.token"];
    setStorageStatus(hasAddress && hasToken ? "Saved configuration loaded." : "No saved configuration yet.");
  } catch (error) {
    setStorageStatus(`Could not read extension storage: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

saveEl?.addEventListener("click", async () => {
  if (!optionsApi?.storage?.local) {
    setStorageStatus("Extension storage is unavailable.", true);
    return;
  }
  try {
    await optionsApi.storage.local.set({
      "inkling.base-url": (baseUrlEl?.value ?? "").trim().replace(/\/+$/, ""),
      "inkling.token": (tokenEl?.value ?? "").trim(),
    });
    if (savedEl) savedEl.textContent = "Saved.";
    setStorageStatus("Saved. This configuration persists until the extension is removed.");
  } catch (error) {
    setStorageStatus(`Could not save extension storage: ${error instanceof Error ? error.message : String(error)}`, true);
  }
});

void load();
