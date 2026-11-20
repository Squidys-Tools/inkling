/// <reference types="bun" />
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { colors, spaceColors } from "./colors";

// The desktop token each phone color mirrors; tokens.stylex.ts can't be imported outside StyleX.
const source: Record<keyof typeof colors, string> = {
  window: "color.window",
  background: "color.app",
  surface: "color.surface",
  raised: "color.raised",
  border: "color.border",
  borderStrong: "color.borderStrong",
  text: "color.ink",
  title: "color.inkStrong",
  inkSoft: "color.inkSoft",
  muted: "color.muted",
  faint: "color.faint",
  placeholder: "color.faint",
  accent: "color.accentStrong",
  accentDeep: "color.accent",
  mascot: "mascotColor.body",
  mascotNotification: "mascotColor.notification",
  success: "color.success",
  warning: "kindColor.quote",
  danger: "color.danger",
  paperYellow: "color.paperYellow",
  articlePaper: "cardColor.articlePaper",
  articleInk: "cardColor.articleInk",
  articleMuted: "cardColor.articleMuted",
  quoteKicker: "cardColor.quoteKicker",
  quoteMark: "cardColor.quoteMark",
  quoteText: "cardColor.quoteText",
  quoteRule: "cardColor.quoteRule",
  postPaper: "cardColor.postPaper",
  postInk: "cardColor.postInk",
  postMuted: "cardColor.postMuted",
  postAvatar: "cardColor.postAvatar",
  tileButton: "cardColor.tileButton",
  stage: "itemColor.stage",
};

function desktopTokens() {
  const file = readFileSync(
    new URL("../../../packages/ui/src/tokens.stylex.ts", import.meta.url),
    "utf8",
  );
  const tokens = new Map<string, string>();
  for (const [, group, body] of file.matchAll(
    /export const (\w+) = stylex\.define(?:Vars|Consts)\(\{(.*?)\n\}\);/gsu,
  ))
    for (const [, name, value] of body?.matchAll(/^\s*(\w+):\s*"([^"]+)"/gmu) ?? [])
      tokens.set(`${group}.${name}`, value ?? "");
  return tokens;
}

test("every phone color is the desktop token it mirrors", () => {
  const tokens = desktopTokens();
  const phone = [
    ...Object.entries(colors).map(([name, value]) => [
      name,
      value,
      source[name as keyof typeof colors],
    ]),
    ...Object.entries(spaceColors).map(([name, value]) => [name, value, `spaceColor.${name}`]),
  ];
  for (const [name, value, token] of phone)
    expect([name, value]).toEqual([name, tokens.get(token ?? "") ?? `no token ${token}`]);
});
