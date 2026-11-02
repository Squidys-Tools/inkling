import { expect, test } from "bun:test";
import { infoText } from "./infoText.ts";

const item = { kind: "image", description: null, metadata: {}, ocrText: "" };
test("photo OCR fragments are hidden without replacing stored text", () => {
  const ocrText =
    '- F ARN -\n4 OR\nARN CHANG x" EN\nLY NR nN AN Ih ¥ 3 » =\nFA GR TR ATS a4 =\nBERR TL Ht tA : “Sl\n§ \\ IRR =\nEE = RARE NF 2\n~ UH N RGN EE oF > NR';
  expect(infoText({ ...item, ocrText })).toBe("");
  expect(infoText({ ...item, ocrText, description: "A wolf standing in snow." })).toBe(
    "A wolf standing in snow.",
  );
});
test("screenshots retain full OCR and genuine photo text remains readable", () => {
  const ocrText = "Terminal\n$ npm run build\n42 / 100\nResult: OK\n".repeat(30).trim();
  expect(infoText({ ...item, ocrText, metadata: { screenshotHash: "saved-capture" } })).toBe(
    ocrText,
  );
  expect(infoText({ ...item, ocrText: "PLEASE KEEP THIS DOOR CLOSED" })).toBe(
    "PLEASE KEEP THIS DOOR CLOSED",
  );
  expect(infoText({ ...item, kind: "pdf", ocrText })).toBe(ocrText);
});
