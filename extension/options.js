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

async function load() {
  const stored = await optionsApi.storage.local.get(["inkling.base-url", "inkling.token"]);
  if (baseUrlEl && typeof stored["inkling.base-url"] === "string") {
    baseUrlEl.value = stored["inkling.base-url"];
  }
  if (tokenEl && typeof stored["inkling.token"] === "string") tokenEl.value = stored["inkling.token"];
}

saveEl?.addEventListener("click", async () => {
  await optionsApi.storage.local.set({
    "inkling.base-url": (baseUrlEl?.value ?? "").trim().replace(/\/+$/, ""),
    "inkling.token": (tokenEl?.value ?? "").trim(),
  });
  if (savedEl) savedEl.textContent = "Saved.";
});

load();
