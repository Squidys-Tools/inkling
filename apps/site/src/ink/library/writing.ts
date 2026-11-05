import type { Writing } from "./items.ts";

export const writingAspect: Record<Writing["kind"], number> = {
  quote: 0.78,
  article: 0.8,
  note: 0.74,
};

const family = '"Red Hat", sans-serif';
const width = 512;

function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// Drawn as an ink mask on transparency; the card shader lays it over its paper.
export function drawWriting(item: Writing) {
  const height = Math.round(width / writingAspect[item.kind]);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.fillStyle = "black";
  context.strokeStyle = "black";
  context.textBaseline = "alphabetic";
  const inset = 52;
  const measure = width - inset * 2;

  if (item.kind === "quote") {
    context.font = `500 44px ${family}`;
    const lines = wrap(context, `“${item.text}”`, measure);
    const leading = 54;
    const top = (height - lines.length * leading) / 2 - 10;
    lines.forEach((line, index) => context.fillText(line, inset, top + leading * (index + 0.8)));
    context.globalAlpha = 0.62;
    context.font = `500 24px ${family}`;
    context.fillText(`— ${item.author}`, inset, height - inset);
  }

  if (item.kind === "article") {
    context.globalAlpha = 0.07;
    context.fillRect(inset, inset, measure, height * 0.38);
    context.globalAlpha = 1;
    context.font = `700 50px ${family}`;
    const lines = wrap(context, item.title, measure);
    const top = inset + height * 0.38 + 46;
    lines.forEach((line, index) => context.fillText(line, inset, top + 56 * (index + 0.8)));
    context.globalAlpha = 0.55;
    context.font = `500 23px ${family}`;
    context.fillText(item.domain, inset, height - inset);
  }

  if (item.kind === "note") {
    context.font = `500 38px ${family}`;
    const lines = wrap(context, item.title, measure);
    lines.forEach((line, index) => context.fillText(line, inset, inset + 40 + 48 * index));
    context.globalAlpha = 0.12;
    context.lineWidth = 2;
    for (let y = inset + 48 * lines.length + 60; y < height - inset; y += 46) {
      context.beginPath();
      context.moveTo(inset, y);
      context.lineTo(width - inset, y);
      context.stroke();
    }
  }
  return canvas;
}
