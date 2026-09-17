// inkling options: local token field wired to chrome.storage.local.
// The token never leaves the machine except to the inkling companion on
// loopback (127.0.0.1). No analytics, no remote calls.
// TODO(phase1): agree the token format/pairing flow with Phases 0-3.
//
// NOTE: Safari is deferred — no Safari target in this phase. When a Safari
// port happens it needs a separate Xcode / Web Extensions target outside
// this manifest set; do not shoehorn it into the Chrome/Firefox manifests.

/** @type {any} */
const optionsGlobal = globalThis;
const optionsApi = optionsGlobal.chrome ?? optionsGlobal.browser;

const tokenEl = /** @type {HTMLInputElement | null} */ (document.getElementById("token"));
const saveEl = document.getElementById("save");
const savedEl = document.getElementById("saved");

async function load() {
  const { "inkling.token": token } = await optionsApi.storage.local.get("inkling.token");
  if (tokenEl && typeof token === "string") tokenEl.value = token;
}

saveEl?.addEventListener("click", async () => {
  await optionsApi.storage.local.set({ "inkling.token": tokenEl?.value ?? "" });
  if (savedEl) savedEl.textContent = "Saved.";
});

load();
