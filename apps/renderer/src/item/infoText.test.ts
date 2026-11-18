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
test("a photo from the screenshots folder is screened like any other photo", () => {
  const ocrText = "I 4s\n1 | 4 z\ni 7 -\n1 \\\n5 La\nSEXES =\n\\ i /\nA]\n7, Ld\nral\n8";
  expect(infoText({ ...item, ocrText, metadata: { screenshotHash: "from-folder" } })).toBe("");
});
test("readable text stays visible, in photos, folder imports and PDFs", () => {
  const ocrText = "Terminal\n$ npm run build\n42 / 100\nResult: OK\n".repeat(30).trim();
  expect(infoText({ ...item, ocrText, metadata: { screenshotHash: "saved-capture" } })).toBe(
    ocrText,
  );
  expect(infoText({ ...item, ocrText: "PLEASE KEEP THIS DOOR CLOSED" })).toBe(
    "PLEASE KEEP THIS DOOR CLOSED",
  );
  expect(infoText({ ...item, kind: "pdf", ocrText })).toBe(ocrText);
});
