// HTML-in-Canvas can paint a DOM subtree without making that subtree a pointer
// target. Never move live controls into it unless the browser preserves hits.
export function canvasAllowsDomInput(document: Document) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("layoutsubtree", "");
  canvas.style.cssText =
    "position:fixed;top:0;left:0;width:2px;height:2px;z-index:2147483647;opacity:0;pointer-events:auto";
  const content = document.createElement("button");
  content.type = "button";
  content.tabIndex = -1;
  content.setAttribute("aria-hidden", "true");
  content.style.cssText = "display:block;width:100%;height:100%;margin:0;padding:0;border:0";
  canvas.append(content);
  try {
    document.body.append(canvas);
    const hit = document.elementFromPoint(1, 1);
    return hit === content || (hit !== null && content.contains(hit));
  } finally {
    canvas.remove();
  }
}
