import { defineRule, type Ranged } from "@oxlint/plugins";

const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/iu;

export default defineRule({
  meta: {
    type: "problem",
    docs: { description: "Colors live in packages/ui/src/tokens.stylex.ts; use a role from it." },
  },
  create(context) {
    const check = (node: Ranged, value: string) => {
      if (COLOR.test(value))
        context.report({
          node,
          message: "Use a color role from tokens.stylex.ts instead of a color value.",
        });
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
});
