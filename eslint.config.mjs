import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored tooling, not application code. Without this, `npm run lint`
    // reports 152 warnings from the Impeccable skill's own scripts and buries
    // anything the app itself produces — the signal this command exists for.
    ".claude/**",
    ".impeccable/**",
  ]),
  // Enforces the locked ingestion rule: no client-triggered upstream API calls.
  // Pages and components read cached data through lib/queries.ts; anything that
  // talks to an upstream API belongs in a scheduled ingestion job behind the
  // CRON_SECRET guard.
  //
  // Note the group list is exact-match, not prefix-match: "@/lib/finnhub" does
  // not cover "@/lib/finnhub-news", so every upstream module is named here
  // individually.
  {
    files: ["src/app/**/page.tsx", "src/app/**/layout.tsx", "src/components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/finnhub",
                "@/lib/finnhub-news",
                "@/lib/finnhub-events",
                "@/lib/yahoo",
                "@/lib/gemini",
                "@/lib/openrouter",
                "@/lib/fred",
                "@/lib/refresh",
                "@/lib/news-ingest",
                "@/lib/daily-summary",
                "@/lib/groq",
                "@/lib/story-generation",
                "@/lib/market-story-generation",
                "@/lib/supabase",
                "@/lib/db-read",
              ],
              message:
                "Pages and components must not reach upstream clients or the database directly. Read cached data via @/lib/queries; writes belong in a scheduled ingestion job (see CLAUDE.md, 'Ingestion architecture').",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
