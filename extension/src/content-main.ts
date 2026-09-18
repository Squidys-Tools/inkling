// Runs in the page's MAIN world (has access to open shadow roots, which the
// isolated world cannot reliably reach). Listens for a flatten request from the
// isolated-world extractor, stamps each open shadow root's content into a
// <template data-defuddle-shadow> placeholder, and replies — so Defuddle in the
// isolated world sees shadow-DOM content as plain markup. Idempotent: re-runs
// skip hosts that already carry a stamped template. Closed shadow roots are
// unreachable by design and stay out of the extraction.

import {
  FLATTEN_DONE_EVENT,
  FLATTEN_REQUEST_EVENT,
  FLATTEN_REQUEST_FLAG,
  SHADOW_STAMP_ATTR,
} from "./shadow-flatten";

function stampHost(host: Element): number {
  const root = (host as HTMLElement).shadowRoot;
  if (!root) return 0;
  if (host.querySelector(`:scope > template[${SHADOW_STAMP_ATTR}]`)) {
    // Already stamped; still recurse so dynamically added nested roots flatten.
    return stampTree(root as unknown as ParentNode);
  }
  const template = document.createElement("template");
  template.setAttribute(SHADOW_STAMP_ATTR, "open");
  template.content.append(root.cloneNode(true));
  host.appendChild(template);
  return 1 + stampTree(root as unknown as ParentNode) + stampTree(template.content as unknown as ParentNode);
}

function stampTree(node: ParentNode): number {
  let count = 0;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
  const hosts: Element[] = [];
  while (walker.nextNode()) {
    const element = walker.currentNode as Element;
    if ((element as HTMLElement).shadowRoot) hosts.push(element);
    // Stamped templates hold cloned shadow markup that may itself contain
    // shadow hosts (nested web components) — walk into those too.
    if (element.tagName === "TEMPLATE" && element.hasAttribute(SHADOW_STAMP_ATTR)) {
      count += stampTree((element as HTMLTemplateElement).content as unknown as ParentNode);
    }
  }
  for (const host of hosts) count += stampHost(host);
  return count;
}

function flatten(): number {
  if (!document.documentElement) return 0;
  return stampTree(document);
}

function reply(count: number): void {
  document.documentElement.dataset[FLATTEN_REQUEST_FLAG] = "done";
  document.dispatchEvent(new CustomEvent(FLATTEN_DONE_EVENT, { detail: { flattened: count } }));
}

document.addEventListener(FLATTEN_REQUEST_EVENT, () => {
  reply(flatten());
});

// The isolated world sets this flag before the MAIN script finishes injecting,
// so a request that races injection is still honored.
if (document.documentElement?.dataset[FLATTEN_REQUEST_FLAG] === "requested") {
  reply(flatten());
}
