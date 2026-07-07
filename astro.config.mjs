// @ts-check

import cloudflare from "@astrojs/cloudflare";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { defineConfig } from "astro/config";
import { baseLocale, locales } from "./src/i18n/runtime";

// https://astro.build/config
export default defineConfig({
  output: "static",
  i18n: {
    defaultLocale: baseLocale,
    locales: [...locales],
  },
  vite: {
    resolve: { tsconfigPaths: true },
    plugins: [
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/i18n",
        strategy: ["baseLocale"],
      }),
    ],
  },
  adapter: cloudflare({}),
});
