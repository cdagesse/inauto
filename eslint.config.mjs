import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const FORMATTERS_MOVED = "Import display formatters from @/lib/format/money.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The money/miles/date formatters live in one module; keep the old copies from
      // coming back under their previous paths.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/components/account/money", message: FORMATTERS_MOVED },
            {
              name: "@/components/market/format",
              importNames: ["usd", "usdK", "mi"],
              message: FORMATTERS_MOVED,
            },
            {
              name: "@/lib/valuation/engine",
              importNames: ["usd", "usdK", "fmtMiles"],
              message: FORMATTERS_MOVED,
            },
          ],
          patterns: [
            { group: ["**/components/account/money"], message: FORMATTERS_MOVED },
            {
              group: ["**/components/market/format", "./format"],
              importNames: ["usd", "usdK", "mi"],
              message: FORMATTERS_MOVED,
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
