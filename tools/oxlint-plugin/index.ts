import { definePlugin } from "@oxlint/plugins";

import noColorLiterals from "./rules/no-color-literals.ts";
import noCssImports from "./rules/no-css-imports.ts";
import noLowValueComments from "./rules/no-low-value-comments.ts";
import requireSuppressionReason from "./rules/require-suppression-reason.ts";

export default definePlugin({
  meta: { name: "inkling" },
  rules: {
    "no-color-literals": noColorLiterals,
    "no-css-imports": noCssImports,
    "no-low-value-comments": noLowValueComments,
    "require-suppression-reason": requireSuppressionReason,
  },
});
