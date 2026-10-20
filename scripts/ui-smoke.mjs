import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const artifactsDir = join(root, ".artifacts", "ui-smoke");
const require = createRequire(import.meta.url);
const electronPath = require("electron");
const viteBin = join(root, "node_modules", "vite", "bin", "vite.js");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function fail(message) {
  throw new Error(message);
}

function buildPreview() {
  const build = spawnSync(process.execPath, [viteBin, "build", "--mode", "electron-preview"], {
    cwd: root,
    stdio: "inherit",
  });
  if (build.status !== 0) fail("ui:smoke: vite build --mode electron-preview failed.");
}

async function freePort() {
  return new Promise((done, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

function launchElectron(userDataDir, port) {
  const appArgs = [
    ".",
    "--preview",
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    "--no-sandbox",
  ];
  const useXvfb = process.platform === "linux" && !process.env.DISPLAY;
  const command = useXvfb ? "xvfb-run" : electronPath;
  const args = useXvfb ? ["-a", "-s", "-screen 0 1280x900x24", electronPath, ...appArgs] : appArgs;
  const stderrTail = [];
  const child = spawn(command, args, {
    cwd: root,
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", (chunk) => {
    stderrTail.push(...chunk.toString().split("\n").filter(Boolean));
    stderrTail.splice(0, Math.max(0, stderrTail.length - 20));
  });
  child.launchError = null;
  child.on("error", (error) => {
    child.launchError = error;
  });
  child.describeStderr = () => stderrTail.slice(-8).join("\n    ");
  return child;
}

function stopElectron(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") child.kill();
  else process.kill(-child.pid, "SIGTERM");
}

async function findPageTarget(port, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.launchError) {
      fail(
        `ui:smoke: could not start Electron (${child.launchError.message}). Install xvfb-run or run with DISPLAY set.`,
      );
    }
    if (child.exitCode !== null) {
      fail(
        `ui:smoke: Electron exited with code ${child.exitCode} before DevTools came up.\n    ${child.describeStderr()}`,
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find(
        (target) => target.type === "page" && !target.url.startsWith("devtools://"),
      );
      if (page) return page;
    } catch {
      // DevTools is not listening yet.
    }
    await sleep(200);
  }
  fail(
    `ui:smoke: Electron did not expose DevTools on port ${port} within ${timeoutMs / 1000}s.\n    ${child.describeStderr()}`,
  );
}

function connectCdp(url) {
  return new Promise((done, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    const consoleErrors = [];
    const consoleWarnings = [];
    let nextId = 0;
    const send = (method, params = {}) =>
      new Promise((resolveSend, rejectSend) => {
        const id = ++nextId;
        pending.set(id, { resolveSend, rejectSend });
        socket.send(JSON.stringify({ id, method, params }));
      });
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) waiter?.rejectSend(new Error(message.error.message));
        else waiter?.resolveSend(message.result);
        return;
      }
      if (
        message.method === "Runtime.consoleAPICalled" &&
        ["error", "warning"].includes(message.params.type)
      ) {
        const text = message.params.args.map((arg) => arg.value ?? arg.description).join(" ");
        (message.params.type === "error" ? consoleErrors : consoleWarnings).push(
          `console.${message.params.type}: ${text}`,
        );
      }
      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params.exceptionDetails;
        consoleErrors.push(`uncaught: ${details.exception?.description ?? details.text}`);
      }
      if (
        message.method === "Log.entryAdded" &&
        ["error", "warning"].includes(message.params.entry.level)
      ) {
        (message.params.entry.level === "error" ? consoleErrors : consoleWarnings).push(
          `log.${message.params.entry.level}: ${message.params.entry.text}`,
        );
      }
    };
    socket.onerror = () => reject(new Error(`could not open DevTools socket ${url}`));
    socket.onopen = async () => {
      try {
        await send("Runtime.enable");
        await send("Log.enable");
        await send("Page.enable");
        await send("Emulation.setDeviceMetricsOverride", {
          width: 1280,
          height: 800,
          deviceScaleFactor: 1,
          mobile: false,
        });
        done({
          send,
          consoleErrors,
          consoleWarnings,
          close: () => socket.close(),
          evaluate: async (fn, ...args) => {
            const page = await send("Runtime.evaluate", { expression: "window" });
            const result = await send("Runtime.callFunctionOn", {
              objectId: page.result.objectId,
              functionDeclaration: fn.toString(),
              arguments: args.map((value) => ({ value })),
              awaitPromise: true,
              returnByValue: true,
            });
            if (result.exceptionDetails)
              throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
            return result.result.value;
          },
        });
      } catch (error) {
        reject(error);
      }
    };
  });
}

const clickSelector = (selector) => {
  const el = document.querySelector(selector);
  if (!el) return false;
  el.click();
  return true;
};
const clickCardContaining = (text) => {
  const card = [...document.querySelectorAll(".library-card")].find((c) =>
    (c.textContent ?? "").includes(text),
  );
  if (!card) return false;
  card.click();
  return true;
};
const clickByText = (selector, text) => {
  const el = [...document.querySelectorAll(selector)].find(
    (node) => (node.textContent ?? "").trim() === text,
  );
  if (!el) return false;
  el.click();
  return true;
};
const clickCaptureOption = (title) => {
  const option = [...document.querySelectorAll(".add-menu-tile")].find(
    (node) => node.textContent?.trim() === title,
  );
  if (!option) return false;
  option.click();
  return true;
};
const setInputValue = (selector, value) => {
  const el = document.querySelector(selector);
  if (!el) return false;
  // Inputs and textareas each have their own value setter.
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
};
const hasSelector = (selector) => Boolean(document.querySelector(selector));
const isGone = (selector) => !document.querySelector(selector);
const isPressed = (selector) =>
  document.querySelector(selector)?.getAttribute("aria-pressed") === "true";
const isFocused = (selector) => document.activeElement === document.querySelector(selector);
const hasCardContaining = (text) =>
  [...document.querySelectorAll(".library-card")].some((card) =>
    (card.textContent ?? "").includes(text),
  );
const cardCount = () => document.querySelectorAll(".library-card").length;

async function run() {
  rmSync(artifactsDir, { recursive: true, force: true });
  mkdirSync(artifactsDir, { recursive: true });
  const userDataDir = mkdtempSync(join(tmpdir(), "inkling-ui-smoke-"));
  const port = await freePort();
  const child = launchElectron(userDataDir, port);
  const results = [];
  let cdp = null;
  let shotIndex = 0;
  let previousFailed = false;

  const screenshot = async (name) => {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    shotIndex += 1;
    const file = join(artifactsDir, `${String(shotIndex).padStart(2, "0")}-${name}.png`);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
  };

  const waitFor = async (description, predicate, ...args) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (await cdp.evaluate(predicate, ...args)) return;
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${description}`);
  };

  const step = async (name, body) => {
    if (previousFailed) {
      results.push({ name, status: "SKIP" });
      return;
    }
    try {
      await body();
      results.push({ name, status: "PASS" });
      await screenshot(name);
    } catch (error) {
      previousFailed = true;
      results.push({ name, status: "FAIL", reason: error.message });
      await screenshot(`${name}-failed`).catch(() => {});
    }
  };

  try {
    const target = await findPageTarget(port, child);
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    let baselineCards = 0;
    await step("library grid renders seeded cards", async () => {
      await waitFor("seeded item card", hasCardContaining, "Fuji over the village lights");
      baselineCards = await cdp.evaluate(cardCount);
    });
    await step("grid and list view toggle", async () => {
      await cdp.evaluate(clickSelector, 'button[aria-label="List view"]');
      await waitFor("list view to be selected", isPressed, 'button[aria-label="List view"]');
      await cdp.evaluate(clickSelector, 'button[aria-label="Grid view"]');
      await waitFor("grid view to be selected", isPressed, 'button[aria-label="Grid view"]');
    });
    await step("search filters and clears", async () => {
      await waitFor(
        "a mounted grid card before searching",
        () => document.querySelector(".library-grid .library-card[data-library-item-id]") !== null,
      );
      const full = await cdp.evaluate(() => ({
        resultCount: Number(document.querySelector(".result-count")?.textContent),
        firstCardId: document.querySelector(".library-grid .library-card[data-library-item-id]")
          ?.dataset.libraryItemId,
      }));
      await cdp.evaluate(setInputValue, 'input[aria-label="Search your mind"]', "Fuji");
      await waitFor(
        "search to narrow the grid",
        (baseline) => {
          const count = document.querySelectorAll(".library-card").length;
          return count > 0 && count < baseline;
        },
        baselineCards,
      );
      await cdp.evaluate(setInputValue, 'input[aria-label="Search your mind"]', "");
      await waitFor(
        "search to clear back to the full results",
        (expected) => {
          const input = document.querySelector('input[aria-label="Search your mind"]');
          const shownCount = Number(document.querySelector(".result-count")?.textContent);
          const cards = [
            ...document.querySelectorAll(".library-grid .library-card[data-library-item-id]"),
          ];
          return (
            input?.value === "" &&
            expected.resultCount > 0 &&
            shownCount === expected.resultCount &&
            cards.length > 0 &&
            cards.length <= expected.resultCount &&
            cards.some((card) => card.dataset.libraryItemId === expected.firstCardId)
          );
        },
        full,
      );
    });
    await step("item overlay opens and closes with the close button and Escape", async () => {
      await cdp.evaluate(clickCardContaining, "Fuji over the village lights");
      await waitFor("item overlay to open", hasSelector, ".expanded-overlay");
      await cdp.evaluate(clickSelector, 'button[aria-label="Close details"]');
      await waitFor("overlay to close from its close button", isGone, ".expanded-overlay");
      await cdp.evaluate(clickCardContaining, "Fuji over the village lights");
      await waitFor("item overlay to reopen", hasSelector, ".expanded-overlay");
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await waitFor("overlay to close on Escape", isGone, ".expanded-overlay");
    });
    const noteText = "ui smoke note";
    await step("note is created and appears in the grid", async () => {
      await cdp.evaluate(clickSelector, 'button[data-tooltip="Add something to your library"]');
      await waitFor("add menu", hasSelector, ".add-menu-tile");
      await cdp.evaluate(clickCaptureOption, "Note");
      await waitFor("note input", hasSelector, 'textarea[aria-label="New note"]');
      await cdp.evaluate(setInputValue, 'textarea[aria-label="New note"]', noteText);
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        text: "\r",
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await waitFor("saved note card", hasCardContaining, noteText);
    });
    const spaceName = "UI Smoke Space";
    await step("space is created and deleted without removing items", async () => {
      await cdp.evaluate(clickSelector, 'button[aria-label="Add a Space"]');
      await waitFor("space name input", hasSelector, 'input[aria-label="Space name"]');
      await cdp.evaluate(setInputValue, 'input[aria-label="Space name"]', spaceName);
      await cdp.evaluate(clickByText, "button", "Create Space");
      await waitFor(
        "new space in sidebar",
        hasSelector,
        `button[aria-label="Delete ${spaceName}"]`,
      );
      const before = await cdp.evaluate(cardCount);
      await cdp.evaluate(clickSelector, `button[aria-label="Delete ${spaceName}"]`);
      await waitFor("space to be deleted", isGone, `button[aria-label="Delete ${spaceName}"]`);
      const after = await cdp.evaluate(cardCount);
      if (after !== before)
        throw new Error(`deleting the space changed the card count from ${before} to ${after}`);
    });
    await step("settings opens on the General tab", async () => {
      await cdp.evaluate(clickSelector, 'button[aria-label="Settings"]');
      await waitFor("settings sections", hasSelector, 'aside[aria-label="Settings sections"]');
      await waitFor("General tab to be selected", () => {
        const tab = [...document.querySelectorAll(".settings-tab")].find(
          (node) => node.textContent?.trim() === "General",
        );
        return tab?.classList.contains("active") === true;
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await waitFor("settings to close", isGone, 'aside[aria-label="Settings sections"]');
    });
    await step("archive selection mode toggles items from its own keyboard stop", async () => {
      const key = async (value, code, windowsVirtualKeyCode) => {
        await cdp.send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: value,
          code,
          windowsVirtualKeyCode,
          nativeVirtualKeyCode: windowsVirtualKeyCode,
        });
        if (value === "Enter")
          await cdp.send("Input.dispatchKeyEvent", {
            type: "char",
            key: value,
            text: "\r",
            unmodifiedText: "\r",
            windowsVirtualKeyCode,
          });
        await cdp.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: value,
          code,
          windowsVirtualKeyCode,
        });
      };
      await cdp.evaluate(clickByText, ".nav-item", "Serendipity");
      await waitFor("serendipity view", hasSelector, '[data-testid="serendipity-view"]');
      const forgottenTitle = await cdp.evaluate(() => {
        const button = document.querySelector('[data-testid="serendipity-forget"]');
        return (
          button?.closest(".serendipity-copy")?.querySelector("h2")?.textContent?.trim() ?? null
        );
      });
      await cdp.evaluate(clickSelector, '[data-testid="serendipity-forget"]');
      await cdp.evaluate(() => document.activeElement?.blur());
      for (let i = 0; i < 12; i++) {
        await key("Tab", "Tab", 9);
        const onEverything = await cdp.evaluate(
          () => document.activeElement?.textContent?.trim().startsWith("Everything") === true,
        );
        if (onEverything) break;
      }
      await key("Enter", "Enter", 13);
      await waitFor(
        "the library grid to come back",
        () => document.querySelector(".library-grid") !== null,
      );
      await cdp.evaluate(setInputValue, 'input[aria-label="Search your mind"]', "");
      await waitFor(
        "the next serendipity item to appear",
        (title) => {
          const heading = document.querySelector(".serendipity-copy h2");
          return heading?.textContent?.trim() !== title;
        },
        forgottenTitle,
      );
      await cdp.evaluate(clickSelector, 'button[aria-label="Settings"]');
      await waitFor("settings sections", hasSelector, 'aside[aria-label="Settings sections"]');
      await cdp.evaluate(() => document.activeElement?.blur());
      let archiveTabFocused = false;
      for (let i = 0; i < 12; i++) {
        await key("Tab", "Tab", 9);
        archiveTabFocused = await cdp.evaluate(() => {
          const active = document.activeElement;
          return (
            active instanceof HTMLButtonElement &&
            active.classList.contains("settings-tab") &&
            active.querySelector("span")?.textContent?.trim() === "Archive"
          );
        });
        if (archiveTabFocused) break;
      }
      if (!archiveTabFocused) throw new Error("Tab did not reach the Archive settings tab");
      await key("Enter", "Enter", 13);
      await waitFor("Archive tab to be selected", () => {
        const tab = [...document.querySelectorAll(".settings-tab")].find(
          (node) => node.querySelector("span")?.textContent?.trim() === "Archive",
        );
        return tab?.classList.contains("active") === true;
      });
      await cdp.evaluate(() => document.activeElement?.blur());
      let selectModeFocused = false;
      for (let i = 0; i < 12; i++) {
        await key("Tab", "Tab", 9);
        selectModeFocused = await cdp.evaluate(
          () => document.activeElement?.getAttribute("aria-label") === "Select archived items",
        );
        if (selectModeFocused) break;
      }
      if (!selectModeFocused) throw new Error("Tab did not reach the multi-select toggle");
      await key("Enter", "Enter", 13);
      await waitFor(
        "multi-select mode",
        hasSelector,
        'button[aria-label="Exit multi-select mode"]',
      );
      await waitFor("archived card", () => {
        return [...document.querySelectorAll(".settings-archive-grid .library-card")].length === 1;
      });

      await cdp.evaluate(() => document.activeElement?.blur());
      let selectButtonFocused = false;
      for (let i = 0; i < 12; i++) {
        await key("Tab", "Tab", 9);
        const focused = await cdp.evaluate(() => {
          const active = document.activeElement;
          return {
            label: active?.getAttribute("aria-label") ?? active?.className ?? null,
            onArticle: active?.classList.contains("library-card") === true,
            onSelectButton: active?.classList.contains("archive-card-select") === true,
          };
        });
        if (focused.onArticle)
          throw new Error("the archived article was reachable by Tab during selection mode");
        if (focused.onSelectButton) {
          selectButtonFocused = true;
          break;
        }
      }
      if (!selectButtonFocused) throw new Error("Tab did not reach the archived Select button");
      const selectButton = await cdp.evaluate(() => {
        const button = document.activeElement;
        if (!(button instanceof HTMLElement)) return null;
        return {
          label: button.getAttribute("aria-label"),
          articleLabel: button.closest(".library-card")?.getAttribute("aria-label") ?? null,
          articleTabIndex: button.closest(".library-card")?.tabIndex ?? null,
        };
      });
      if (!selectButton?.label?.startsWith("Select "))
        throw new Error(`selection mode button is named ${selectButton.label}`);
      if (selectButton.articleTabIndex !== -1)
        throw new Error("the archived article stayed in the Tab order during selection mode");
      if (selectButton.articleLabel !== forgottenTitle)
        throw new Error(
          `selection mode article is named ${selectButton.articleLabel}, expected ${forgottenTitle}`,
        );
      await key("Enter", "Enter", 13);
      await waitFor("archived item to be selected", () => {
        return (
          document.querySelector(".settings-selected-count")?.textContent?.trim() ===
            "1 selected" &&
          document
            .querySelector(".settings-archive-grid .archive-card-select")
            ?.getAttribute("aria-pressed") === "true"
        );
      });
      const cardPoint = await cdp.evaluate((title) => {
        const card = [...document.querySelectorAll(".settings-archive-grid .library-card")].find(
          (node) => node.getAttribute("aria-label") === title,
        );
        if (!(card instanceof HTMLElement)) return null;
        const rect = card.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }, forgottenTitle);
      if (!cardPoint) throw new Error("could not locate the selected archived card");
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...cardPoint });
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...cardPoint,
        button: "left",
        clickCount: 1,
      });
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...cardPoint,
        button: "left",
        clickCount: 1,
      });
      await waitFor("card click to focus and deselect it", () => {
        const card = document.querySelector(".settings-archive-grid .library-card");
        return (
          document.querySelector(".settings-selected-count")?.textContent?.trim() ===
            "0 selected" && document.activeElement === card
        );
      });
      await key("Enter", "Enter", 13);
      await waitFor("Enter on an archived card to toggle selection", () => {
        const card = document.querySelector(".settings-archive-grid .library-card");
        return (
          document.querySelector(".settings-selected-count")?.textContent?.trim() ===
            "1 selected" &&
          document.activeElement === card &&
          !document.querySelector(".expanded-overlay")
        );
      });
      await cdp.evaluate(() => document.activeElement?.blur());
      let exitSelectFocused = false;
      for (let i = 0; i < 12; i++) {
        await key("Tab", "Tab", 9);
        exitSelectFocused = await cdp.evaluate(
          () => document.activeElement?.getAttribute("aria-label") === "Exit multi-select mode",
        );
        if (exitSelectFocused) break;
      }
      if (!exitSelectFocused) throw new Error("Tab did not reach the multi-select toggle");
      await key("Enter", "Enter", 13);
      await waitFor(
        "selection mode to close",
        isGone,
        'button[aria-label="Exit multi-select mode"]',
      );
      await cdp.evaluate(() => document.activeElement?.blur());
      let deleteButtonFocused = false;
      for (let i = 0; i < 12; i++) {
        await key("Tab", "Tab", 9);
        deleteButtonFocused = await cdp.evaluate(
          () => document.activeElement?.classList.contains("archive-card-delete") === true,
        );
        if (deleteButtonFocused) break;
      }
      if (!deleteButtonFocused)
        throw new Error("the archived Delete button left the Tab order after selection mode");
      const restored = await cdp.evaluate(() => {
        const card = document.querySelector(".settings-archive-grid .library-card");
        return card instanceof HTMLElement
          ? {
              label: card.getAttribute("aria-label"),
              tabIndex: card.tabIndex,
            }
          : null;
      });
      if (restored?.tabIndex !== 0)
        throw new Error("the archived card did not return to its normal keyboard stop");
      if (restored.label !== `Open details for ${forgottenTitle}`)
        throw new Error(`archived card is named ${restored.label} after leaving selection mode`);
      await key("Escape", "Escape", 27);
      await waitFor("settings to close", isGone, 'aside[aria-label="Settings sections"]');
    });
    await step("onboarding keeps keyboard focus inside its dialog", async () => {
      const key = async (value, code, windowsVirtualKeyCode) => {
        await cdp.send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: value,
          code,
          windowsVirtualKeyCode,
          nativeVirtualKeyCode: windowsVirtualKeyCode,
        });
        if (value === "Enter")
          await cdp.send("Input.dispatchKeyEvent", {
            type: "char",
            key: value,
            text: "\r",
            unmodifiedText: "\r",
            windowsVirtualKeyCode,
          });
        await cdp.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: value,
          code,
          windowsVirtualKeyCode,
        });
      };
      for (let i = 0; i < 60; i++) {
        const isGear = await cdp.evaluate(() =>
          Boolean(document.activeElement?.matches('button[aria-label="Settings"]')),
        );
        if (isGear) break;
        await key("Tab", "Tab", 9);
      }
      if (
        !(await cdp.evaluate(() =>
          Boolean(document.activeElement?.matches('button[aria-label="Settings"]')),
        ))
      )
        throw new Error("Tab did not reach the Settings button");
      await key("Enter", "Enter", 13);
      await waitFor("settings sections", hasSelector, 'aside[aria-label="Settings sections"]');
      await cdp.evaluate(() => document.activeElement?.blur());
      let generalTabFocused = false;
      for (let i = 0; i < 10; i++) {
        await key("Tab", "Tab", 9);
        generalTabFocused = await cdp.evaluate(
          () => document.activeElement?.textContent?.trim().startsWith("General") === true,
        );
        if (generalTabFocused) break;
      }
      if (!generalTabFocused) throw new Error("Tab did not reach the General settings tab");
      await key("Enter", "Enter", 13);
      await waitFor("General tab to be selected", () => {
        const tab = [...document.querySelectorAll(".settings-tab")].find(
          (node) => node.textContent?.trim() === "General",
        );
        return tab?.classList.contains("active") === true;
      });
      await waitFor("welcome rerun control", hasSelector, "button.settings-data-button");
      await cdp.evaluate(() => document.activeElement?.blur());
      let welcomeControlFocused = false;
      for (let i = 0; i < 10; i++) {
        await key("Tab", "Tab", 9);
        welcomeControlFocused = await cdp.evaluate(() => {
          const active = document.activeElement;
          return (
            active?.classList.contains("settings-data-button") === true &&
            active.textContent?.trim() === "Show the welcome again"
          );
        });
        if (welcomeControlFocused) break;
      }
      if (!welcomeControlFocused) throw new Error("Tab did not reach the welcome rerun control");
      await key("Enter", "Enter", 13);
      await waitFor("welcome dialog", hasSelector, ".first-run-overlay[aria-modal='true']");
      if (!(await cdp.evaluate(isFocused, ".first-run-primary")))
        throw new Error("welcome dialog did not focus Continue on open");

      const tab = async (shiftKey = false) => {
        await cdp.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Tab",
          code: "Tab",
          shiftKey,
          windowsVirtualKeyCode: 9,
        });
        await cdp.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Tab",
          code: "Tab",
          shiftKey,
          windowsVirtualKeyCode: 9,
        });
      };
      await tab();
      if (!(await cdp.evaluate(isFocused, ".first-run-quiet")))
        throw new Error("Tab did not move from Continue to Skip");
      await tab();
      if (!(await cdp.evaluate(isFocused, ".first-run-primary")))
        throw new Error("Tab escaped the welcome dialog instead of wrapping");
      await tab(true);
      if (!(await cdp.evaluate(isFocused, ".first-run-quiet")))
        throw new Error("Shift+Tab did not wrap to Skip");
      await cdp.evaluate(clickSelector, ".first-run-primary");
      await waitFor(
        "welcome to advance to its second screen",
        (text) => document.querySelector(".first-run-headline")?.textContent?.trim() === text,
        "Kept as it came.",
      );
      if (!(await cdp.evaluate(isFocused, ".first-run-primary")))
        throw new Error("welcome screen change did not focus Continue");
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await waitFor("welcome dialog to close on Escape", isGone, ".first-run-overlay");
      await waitFor(
        "search to regain focus after welcome closes",
        isFocused,
        'input[aria-label="Search your mind"]',
      );
    });
    await step("slash focuses search", async () => {
      await cdp.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "/",
        code: "Slash",
        text: "/",
        windowsVirtualKeyCode: 191,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "/",
        code: "Slash",
        windowsVirtualKeyCode: 191,
      });
      await waitFor("search to take focus", isFocused, 'input[aria-label="Search your mind"]');
      const searchValue = await cdp.evaluate(
        () => document.querySelector('input[aria-label="Search your mind"]')?.value,
      );
      if (searchValue !== "") throw new Error("the slash shortcut typed into the search field");
    });
    await step(
      "keyboard scrolling exposes virtualized cards and preserves nested focus",
      async () => {
        const key = async (value, code, windowsVirtualKeyCode) => {
          for (const type of ["keyDown", "keyUp"])
            await cdp.send("Input.dispatchKeyEvent", {
              type,
              key: value,
              code,
              windowsVirtualKeyCode,
            });
        };
        const gridState = () =>
          cdp.evaluate(() => {
            const grid = document.querySelector(".library-grid");
            if (!(grid instanceof HTMLElement)) return null;
            const cards = [...grid.querySelectorAll(".library-card[data-library-item-id]")];
            return {
              scrollTop: grid.scrollTop,
              maxScroll: grid.scrollHeight - grid.clientHeight,
              cardIds: cards.map((card) => card.dataset.libraryItemId),
              cardsAreFocusable: cards.every((card) => card.tabIndex === 0),
              gridHasFocus: document.activeElement === grid,
            };
          });
        const settle = async () => {
          let previous = "";
          let stablePolls = 0;
          const deadline = Date.now() + 3_000;
          while (Date.now() < deadline) {
            const state = await gridState();
            if (!state) throw new Error("library grid was removed while scrolling");
            const signature = JSON.stringify(state);
            stablePolls = signature === previous ? stablePolls + 1 : 0;
            if (stablePolls >= 2) return state;
            previous = signature;
            await sleep(50);
          }
          throw new Error("library grid did not settle after keyboard scrolling");
        };

        let reachedLibraryRegion = false;
        for (let i = 0; i < 24; i++) {
          await key("Tab", "Tab", 9);
          if (await cdp.evaluate(isFocused, ".library-grid")) {
            reachedLibraryRegion = true;
            break;
          }
        }
        if (!reachedLibraryRegion)
          throw new Error("Tab did not reach the named library-items region");
        const expectedCount = await cdp.evaluate(() => {
          const everything = [...document.querySelectorAll(".nav-item")].find(
            (button) => button.querySelector("span")?.textContent?.trim() === "Everything",
          );
          return Number(everything?.querySelector(".nav-count")?.textContent);
        });
        if (!Number.isInteger(expectedCount) || expectedCount < 1)
          throw new Error("could not read the library's item count");
        await key("Home", "Home", 36);
        let state = await settle();
        const visited = new Set();
        const collectMountedCards = (current) => {
          if (!current.cardsAreFocusable)
            throw new Error("a mounted library card is missing from the Tab order");
          for (const id of current.cardIds) visited.add(id);
        };
        collectMountedCards(state);
        await key("PageDown", "PageDown", 34);
        await waitFor(
          "library region to page down",
          (previous) => {
            const grid = document.querySelector(".library-grid");
            return grid instanceof HTMLElement && grid.scrollTop > previous;
          },
          state.scrollTop,
        );
        state = await settle();
        for (let i = 0; i < 60; i++) {
          collectMountedCards(state);
          if (!state.gridHasFocus)
            throw new Error("keyboard scrolling moved focus out of the library region");
          if (state.scrollTop >= state.maxScroll - 1) break;
          const previousScrollTop = state.scrollTop;
          await key("ArrowDown", "ArrowDown", 40);
          await waitFor(
            "library region to scroll down",
            (previous) => {
              const grid = document.querySelector(".library-grid");
              return grid instanceof HTMLElement && grid.scrollTop > previous;
            },
            previousScrollTop,
          );
          state = await settle();
        }
        collectMountedCards(state);
        if (visited.size !== expectedCount)
          throw new Error(
            `keyboard scrolling exposed ${visited.size} of ${expectedCount} library cards`,
          );
        await key("Tab", "Tab", 9);
        const focusedCard = await cdp.evaluate(() => {
          const card = document.activeElement?.closest(".library-card[data-library-item-id]");
          return card instanceof HTMLElement
            ? {
                id: card.dataset.libraryItemId,
                outline: getComputedStyle(card).outlineStyle,
                outlineWidth: getComputedStyle(card).outlineWidth,
              }
            : null;
        });
        if (focusedCard?.outline !== "solid" || focusedCard.outlineWidth !== "2px")
          throw new Error("Tab did not focus a library card with a visible focus indicator");
        const cardFocused = await cdp.evaluate((id) => {
          const card = [
            ...document.querySelectorAll(".library-grid .library-card[data-library-item-id]"),
          ].find((item) => item.getAttribute("data-library-item-id") === id);
          if (!(card instanceof HTMLElement)) return false;
          card.focus({ preventScroll: true });
          return document.activeElement === card;
        }, focusedCard.id);
        if (!cardFocused) throw new Error("could not focus the library card before opening it");
        await key("Enter", "Enter", 13);
        await waitFor("focused library card to open", hasSelector, ".expanded-overlay");
        await key("Escape", "Escape", 27);
        await waitFor("focused library card to close", isGone, ".expanded-overlay");
        await waitFor(
          "detail close to restore focus to its card",
          (id) => {
            const card = document.activeElement?.closest(".library-card[data-library-item-id]");
            return card?.getAttribute("data-library-item-id") === id;
          },
          focusedCard.id,
        );
        await key("Home", "Home", 36);
        await waitFor(
          "focus to remain on the card or return to its grid after scrolling Home",
          (id) => {
            const grid = document.querySelector(".library-grid");
            const card = [
              ...(grid?.querySelectorAll(".library-card[data-library-item-id]") ?? []),
            ].find((item) => item.getAttribute("data-library-item-id") === id);
            return (
              grid instanceof HTMLElement &&
              ((document.activeElement === grid && !card) || document.activeElement === card)
            );
          },
          focusedCard.id,
        );

        const focusProbe = await cdp.evaluate(() => {
          const grid = document.querySelector(".library-grid");
          if (!(grid instanceof HTMLElement)) return null;
          const card = grid.querySelector(".library-card[data-library-item-id]");
          const id = card?.getAttribute("data-library-item-id");
          if (!id) return null;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "smoke-focus-probe";
          button.setAttribute("aria-label", "Keyboard scroll focus probe");
          button.dataset.cardId = id;
          button.textContent = "Keyboard probe";
          button.style.position = "absolute";
          button.style.top = "0";
          button.style.left = "0";
          grid.append(button);
          return id;
        });
        if (!focusProbe) throw new Error("could not add a nested library-grid control");
        const cardActionId = focusProbe;
        await cdp.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        const nestedProbeFocused = await cdp.evaluate(() => {
          const probe = document.querySelector(".smoke-focus-probe");
          if (!(probe instanceof HTMLButtonElement)) return false;
          probe.focus({ preventScroll: true });
          return document.activeElement === probe;
        });
        if (!nestedProbeFocused) throw new Error("could not focus the nested library-grid control");
        const scrollBeforeNestedAction = await cdp.evaluate(
          () => document.querySelector(".library-grid")?.scrollTop ?? null,
        );
        await key("ArrowDown", "ArrowDown", 40);
        await waitFor(
          "the grid to scroll from a nested card action",
          (previous) => {
            const grid = document.querySelector(".library-grid");
            return grid instanceof HTMLElement && grid.scrollTop > previous;
          },
          scrollBeforeNestedAction,
        );
        await waitFor(
          "the nested card control to keep keyboard focus",
          (id) => {
            const active = document.activeElement;
            return (
              active instanceof HTMLButtonElement &&
              active.classList.contains("smoke-focus-probe") &&
              active.dataset.cardId === id
            );
          },
          cardActionId,
        );
        await cdp.evaluate(() => document.querySelector(".smoke-focus-probe")?.remove());
      },
    );
    await step("no console errors during the run", async () => {
      if (cdp.consoleErrors.length > 0) throw new Error(cdp.consoleErrors.slice(0, 5).join(" | "));
    });
    for (const warning of new Set(cdp.consoleWarnings)) console.log(`WARN ${warning}`);
  } finally {
    cdp?.close();
    stopElectron(child);
    rmSync(userDataDir, { recursive: true, force: true });
  }

  for (const result of results) {
    const reason = result.reason ? `: ${result.reason}` : "";
    console.log(`${result.status} ${result.name}${reason}`);
  }
  const passed = results.filter((result) => result.status === "PASS").length;
  console.log(`RESULT ${passed}/${results.length} passed`);
  if (results.some((result) => result.status !== "PASS")) process.exit(1);
}

try {
  if (!existsSync(join(root, "node_modules")))
    fail("ui:smoke: node_modules is missing. Run bun install first.");
  buildPreview();
  await run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
