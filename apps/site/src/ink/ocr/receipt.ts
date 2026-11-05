const receiptSize = { width: 768, height: 1152 } as const;

const font = '"Red Hat", sans-serif';
const left = 92;
const right = receiptSize.width - 92;
const gap = 30;

const items = [
  ["Tonkotsu ramen", "14.00"],
  ["Ajitama", "2.50"],
  ["Gyoza (6)", "7.00"],
] as const;

/** A box in texture space, 0..1 from the top left, around one printed word. */
export type WordBox = { x: number; y: number; width: number; height: number };

function rule(context: CanvasRenderingContext2D, y: number) {
  for (let x = left; x < right; x += 22) context.fillRect(x, y, 12, 3);
}

// Ink is drawn in the canvas's default fill into alpha only; the shader gives paper and ink their color.
export function drawReceipt(canvas: HTMLCanvasElement): WordBox {
  canvas.width = receiptSize.width;
  canvas.height = receiptSize.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d canvas unavailable");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = "alphabetic";

  context.textAlign = "center";
  context.font = `700 76px ${font}`;
  context.letterSpacing = "6px";
  context.fillText("MENYA KOJI", receiptSize.width / 2, 210);
  context.letterSpacing = "0px";
  rule(context, 288);

  context.font = `500 50px ${font}`;
  let word: WordBox = { x: 0, y: 0, width: 0, height: 0 };
  items.forEach(([name, price], index) => {
    const y = 420 + index * 104;
    context.textAlign = "left";
    if (index === 0) {
      context.fillText("Tonkotsu", left, y);
      context.fillText("ramen", left + context.measureText("Tonkotsu").width + gap, y);
    } else context.fillText(name, left, y);
    context.textAlign = "right";
    context.fillText(price, right, y);
    if (index === 0) {
      const start = left + context.measureText("Tonkotsu").width + gap;
      const metrics = context.measureText("ramen");
      const ascent = metrics.actualBoundingBoxAscent || 28;
      const descent = metrics.actualBoundingBoxDescent || 2;
      word = {
        x: start / receiptSize.width,
        y: (y - ascent) / receiptSize.height,
        width: metrics.width / receiptSize.width,
        height: (ascent + descent) / receiptSize.height,
      };
    }
  });

  rule(context, 712);
  context.font = `700 58px ${font}`;
  context.textAlign = "left";
  context.fillText("TOTAL", left, 830);
  context.textAlign = "right";
  context.fillText("23.50", right, 830);

  for (let index = 0, x = left + 60; x < right - 60; index++) {
    const width = 3 + ((index * 7) % 5) * 2;
    context.fillRect(x, 960, width, 92);
    x += width + 5 + ((index * 3) % 4) * 2;
  }
  return word;
}
