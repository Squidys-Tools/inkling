import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getIconById } from "runeicons";
import { icons } from "./manifest.ts";

const outDir = fileURLToPath(new URL("../../packages/ui/src/icons/", import.meta.url));
const nodeModules = new URL("../../node_modules/", import.meta.url);

const inner = (svg: string) =>
  svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");

const viewBoxOf = (svg: string) => /viewBox="([^"]+)"/.exec(svg)?.[1] ?? "0 0 24 24";

const tidy = (markup: string) =>
  markup.replace(/>\s+</g, "><").replace(/\s+/g, " ").replace(/ \/>/g, "/>").trim();

function rune(id: string) {
  const variant = getIconById(id)?.variants.normal;
  if (!variant) throw new Error(`Rune Icons has no outline icon "${id}"`);
  let body = variant.markup;
  // Rune exports some icons inside a clip the size of the canvas. Its id would repeat per instance, so drop it.
  for (const [defs, width, height] of body.matchAll(
    /<defs>\s*<clipPath id="[^"]+">\s*<rect width="(\d+)" height="(\d+)" fill="white"\/>\s*<\/clipPath>\s*<\/defs>/g,
  )) {
    if (variant.viewBox !== `0 0 ${width} ${height}`)
      throw new Error(`"${id}" has a clip that is not its canvas`);
    body = body.replace(defs, "").replace(/ clip-path="url\(#[^"]+\)"/, "");
  }
  if (body.includes("url(#")) throw new Error(`"${id}" refers to an id this generator keeps`);
  // The stroke width moves to the <svg>, so <Icon strokeWidth> can change it.
  return { viewBox: variant.viewBox, body: tidy(body.replaceAll(' stroke-width="2"', "")) };
}

function lucide(name: string) {
  const svg = readFileSync(new URL(`lucide-static/icons/${name}.svg`, nodeModules), "utf8");
  return { viewBox: viewBoxOf(svg), body: tidy(inner(svg)) };
}

function brand(slug: string) {
  const svg = readFileSync(new URL(`runeicons-brands/svg/${slug}.svg`, nodeModules), "utf8");
  const body = inner(svg).replace(/ fill="#[0-9a-fA-F]+"/g, "");
  return {
    viewBox: viewBoxOf(svg),
    body: tidy(`<g fill="currentColor" stroke="none">${body}</g>`),
  };
}

const sources = { rune, lucide, brand };

export function generate() {
  return new Map<string, string>(
    Object.entries(icons).map(([name, source]) => {
      const [kind, id] = source.split(":") as [keyof typeof sources, string];
      const { viewBox, body } = sources[kind](id);
      return [
        `${name}.ts`,
        `// Generated from ${source} by tools/icons/generate.ts. Edit tools/icons/manifest.ts instead.\n` +
          `export default {\n  viewBox: ${JSON.stringify(viewBox)},\n  body: ${JSON.stringify(body)},\n};\n`,
      ];
    }),
  );
}

if (import.meta.main) {
  const files = generate();
  mkdirSync(outDir, { recursive: true });
  for (const stale of readdirSync(outDir)) if (!files.has(stale)) rmSync(`${outDir}${stale}`);
  for (const [name, text] of files) writeFileSync(`${outDir}${name}`, text);
  console.log(`Wrote ${files.size} icons to packages/ui/src/icons`);
}
