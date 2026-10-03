import { parse, suggest } from "../.compiled/csv.js";
import { analyze } from "../.compiled/engine.js";
import { exportPlan, exportUnresolved } from "../.compiled/export.js";
import { performance } from "node:perf_hooks";
import os from "node:os";
import fs from "node:fs/promises";
const rows = 50000,
  plan =
    "source_url;decision;target_url;planned_status;reason\n" +
    Array.from(
      { length: rows },
      (_, i) =>
        `https://volume.example/p${i};redirect;https://volume.example/p${i + 1};301;`,
    ).join("\n"),
  inventory =
    "url;clicks\n" +
    Array.from(
      { length: rows },
      (_, i) => `https://volume.example/p${i};1`,
    ).join("\n");
const start = performance.now(),
  p = parse(plan),
  iv = parse(inventory),
  parsed = performance.now(),
  r = analyze(
    p,
    suggest(p.headers, "plan"),
    iv,
    suggest(iv.headers, "inventory"),
  ),
  analyzed = performance.now();
const exp = exportPlan(r),
  abs = exportUnresolved(r),
  end = performance.now();
const result = {
  date: new Date().toISOString(),
  node: process.version,
  platform: os.platform(),
  arch: os.arch(),
  os: os.release(),
  cpu: os.cpus()[0].model,
  rowsPerFile: rows,
  bytes: {
    plan: Buffer.byteLength(plan),
    inventory: Buffer.byteLength(inventory),
    annotated: Buffer.byteLength(exp.text),
    unresolved: Buffer.byteLength(abs.text),
  },
  milliseconds: {
    parse: parsed - start,
    analyze: analyzed - parsed,
    exports: end - analyzed,
    total: end - start,
  },
  route: r.routes.get("https://volume.example/p0"),
  metrics: r.metrics,
  heapUsed: process.memoryUsage().heapUsed,
};
await fs.writeFile(
  "evidence/benchmark.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      rows,
      timings: result.milliseconds,
      route: result.route,
      heap: result.heapUsed,
    },
    null,
    2,
  ),
);
