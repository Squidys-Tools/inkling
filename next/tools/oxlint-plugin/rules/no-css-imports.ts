import { defineRule } from "@oxlint/plugins";

export default defineRule({
  meta: {
    type: "problem",
    docs: { description: "All styling is StyleX; the app ships no stylesheet of its own." },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (/\.css(?:\?.*)?$/u.test(node.source.value))
          context.report({ node, message: "Style with stylex.create instead of a CSS file." });
      },
    };
  },
});
