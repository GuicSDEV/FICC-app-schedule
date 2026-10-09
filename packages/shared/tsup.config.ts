import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  target: "es2022",
  // Never wipe dist while watching: the API and web dev servers read it live.
  clean: !options.watch,
}));
