import baseConfig from "../../prettier.config.mjs";

// Lives in apps/web so the Tailwind plugin resolves this app's Tailwind v4 install.
/** @type {import("prettier").Config & import("prettier-plugin-tailwindcss").PluginOptions} */
const config = {
  ...baseConfig,
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./app/globals.css",
  tailwindFunctions: ["cn", "cva"],
};

export default config;
