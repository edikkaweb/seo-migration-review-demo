import { build } from "esbuild";
await build({
  entryPoints: [
    "src/engine.ts",
    "src/csv.ts",
    "src/url.ts",
    "src/export.ts",
    "src/fixtures.ts",
    "src/graph.ts",
    "src/codes.ts",
  ],
  outdir: ".compiled",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "warning",
});
