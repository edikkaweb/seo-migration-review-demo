import { build } from "esbuild";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { fixtures } from "../.compiled/fixtures.js";
import { parse, suggest } from "../.compiled/csv.js";
import { analyze } from "../.compiled/engine.js";
import { CODES } from "../.compiled/codes.js";
const f = fixtures(),
  p = parse(f["plan-exemple.csv"], "plan-exemple.csv"),
  i = parse(f["inventaire-exemple.csv"], "inventaire-exemple.csv");
const r = analyze(
    p,
    suggest(p.headers, "plan"),
    i,
    suggest(i.headers, "inventory"),
  ),
  m = r.metrics;
await fs.rm("dist", { recursive: true, force: true });
await fs.mkdir("dist/fixtures", { recursive: true });
await fs.mkdir("dist/docs", { recursive: true });
await fs.mkdir("fixtures", { recursive: true });
for (const [name, text] of Object.entries(f)) {
  await fs.writeFile("dist/fixtures/" + name, text);
  await fs.writeFile("fixtures/" + name, text);
}
await fs.writeFile(
  "fixtures/expected.json",
  JSON.stringify(
    {
      total: m.total,
      knownClicks: m.knownClicks,
      documented: m.documented,
      unresolved: m.unresolved,
      coverage: m.coverage,
      unresolvedClicks: m.unresolvedClicks,
      unresolvedShare: m.unresolvedShare,
    },
    null,
    2,
  ) + "\n",
);
await fs.copyFile("fixtures/expected.json", "dist/fixtures/expected.json");
await build({
  entryPoints: ["src/app.ts", "src/worker.ts"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "eof",
});
await fs.copyFile("public/style.css", "dist/style.css");
const nf = (n) => n.toLocaleString("fr-FR");
const escapes = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let html = await fs.readFile("public/template.html", "utf8");
const replacements = {
  COVERAGE: nf(m.coverage),
  TOTAL: nf(m.total),
  DECIDED: nf(m.documented),
  MISSING: nf(m.unresolved),
  CLICKS: nf(m.knownClicks),
  UNRESOLVED_CLICKS: nf(m.unresolvedClicks),
  SHARE: nf(m.unresolvedShare),
  ERRORS: r.findings.filter((x) => x.severity === "error").length,
  CODES: Object.entries(CODES)
    .map(
      ([code, c]) =>
        `<tr><th scope="row"><code>${code}</code></th><td>${escapes(c[2])}</td><td>${escapes(c[3])}</td></tr>`,
    )
    .join(""),
};
for (const [k, v] of Object.entries(replacements))
  html = html.replaceAll("{{" + k + "}}", String(v));
if (/\{\{/.test(html)) throw new Error("Placeholder non résolu");
await fs.writeFile("dist/index.html", html);
for (const name of [
  "README.md",
  "METHOD.md",
  "TESTING.md",
  "CHANGELOG.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
]) {
  await fs.copyFile(name, "dist/docs/" + name);
}
await fs.mkdir("dist/docs/docs", { recursive: true });
for (const name of ["DEPLOYMENT.md", "LIBRARY-COPY.md"]) {
  await fs.copyFile("docs/" + name, "dist/docs/docs/" + name);
}
await fs.copyFile(
  "node_modules/papaparse/LICENSE",
  "dist/docs/PAPA-PARSE-LICENSE.txt",
);
// Actions publishes dist directly; no Jekyll marker is needed or uploaded.
const files = async (dir) => {
  const arr = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + e.name;
    if (e.isDirectory()) arr.push(...(await files(path)));
    else arr.push(path);
  }
  return arr;
};
const manifest = { application: "1.0.0", method: "1.0.0", files: [] };
for (const file of (await files("dist")).sort()) {
  const b = await fs.readFile(file);
  manifest.files.push({
    path: file.slice(5),
    bytes: b.length,
    sha256: createHash("sha256").update(b).digest("hex"),
  });
}
await fs.writeFile(
  "dist/build-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Build : ${manifest.files.length + 1} fichiers publics, exemple ${m.coverage} % / ${m.unresolvedShare} %.`,
);
