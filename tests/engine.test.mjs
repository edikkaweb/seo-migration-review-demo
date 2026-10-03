import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../.compiled/engine.js";
import { parse, suggest, decode, clicks } from "../.compiled/csv.js";
import { normalize } from "../.compiled/url.js";
import { fixtures } from "../.compiled/fixtures.js";
import {
  exportPlan,
  exportUnresolved,
  neutralize,
  manifest,
} from "../.compiled/export.js";
const f = fixtures(),
  run = (p, i = null, opts = {}) => {
    const pf = parse(p),
      iv = i === null ? null : parse(i);
    return analyze(
      pf,
      suggest(pf.headers, "plan"),
      iv,
      iv ? suggest(iv.headers, "inventory") : {},
      opts,
    );
  };
const fixture = () => run(f["plan-exemple.csv"], f["inventaire-exemple.csv"]);
const plan = (rows) =>
  "source_url;decision;target_url;planned_status;reason\n" + rows;
const base = {
  sourceBase: "https://a.example/",
  targetBase: "https://a.example/",
};
test("corpus exact et complété, couverture distincte des anomalies", () => {
  const r = fixture(),
    m = r.metrics;
  assert.equal(m.total, 100);
  assert.equal(m.knownClicks, 10000);
  assert.equal(m.documented, 86);
  assert.equal(m.unresolved, 14);
  assert.equal(m.coverage, 86);
  assert.equal(m.unresolvedClicks, 3100);
  assert.equal(m.unresolvedShare, 31);
  assert.equal(m.categories.remove.clicks, 500);
  assert.equal(r.findings.filter((x) => x.severity === "error").length, 0);
  assert(
    r.findings.some(
      (x) => x.code === "CONCENTRATION_IMMEDIATE" && x.severity === "review",
    ),
  );
  assert.equal(
    run(f["plan-complete.csv"], f["inventaire-exemple.csv"]).metrics.coverage,
    100,
  );
});
test("keep/remove conservés ; vide jamais remove", () => {
  const r = run(
    plan("/a;keep;;;\n/b;remove;;410;volontaire\n/c;;;;"),
    "url;clicks\n/a;0\n/b;100\n/c;20",
    base,
  );
  assert.deepEqual(
    r.plan.map((x) => x.decision),
    ["keep", "remove", "undecided"],
  );
  assert.equal(r.metrics.documented, 2);
  assert.equal(r.metrics.unresolved, 1);
});
test("deux colonnes : inférence, ambiguïté et auto explicite", () => {
  const r = run("ancienne URL;nouvelle URL\n/a;/b\n/b;/b\n/c;", null, base);
  assert.deepEqual(
    r.plan.map((x) => [x.decision, x.origin]),
    [
      ["redirect", "inferred"],
      ["ambiguous", "missing"],
      ["undecided", "missing"],
    ],
  );
  const s = run(plan("/a;redirect;/a;301;"), "url\n/a", base);
  assert.equal(s.metrics.coverage, 100);
  assert(s.findings.some((x) => x.code === "SELF_REDIRECT"));
  assert.equal(s.routes.get("https://a.example/a").terminal, null);
});
test("boucles, prédécesseurs, chaînes et cible supprimée", () => {
  const r = run(f["plan-anomalies.csv"], f["inventaire-anomalies.csv"], base);
  assert.equal(r.routes.get(base.sourceBase + "vers-boucle").kind, "cycle");
  assert.equal(r.routes.get(base.sourceBase + "depart").hops, 2);
  assert.equal(r.routes.get(base.sourceBase + "depart").kind, "keep");
  assert.equal(r.routes.get(base.sourceBase + "vers-perimee").kind, "remove");
  assert.equal(
    r.routes.get(base.sourceBase + "avant-conflit").kind,
    "conflict",
  );
  assert.equal(r.routes.get(base.sourceBase + "avant-conflit").terminal, null);
  assert(!r.edges.has(base.sourceBase + "conflit"));
  assert(r.findings.some((x) => x.code === "PLAN_DUPLICATE"));
  assert(
    !r.findings.some(
      (x) => x.code === "TARGET_REDIRECTED" && x.proof.includes("/guide"),
    ),
  );
});
test("50 000 sauts itératifs sans terminal HTTP inventé", () => {
  const rows = Array.from(
    { length: 50000 },
    (_, i) => `/p${i};redirect;/p${i + 1};301;`,
  );
  const r = run(plan(rows.join("\n")), null, base);
  assert.equal(r.routes.get(base.sourceBase + "p0").hops, 50000);
  assert.equal(r.routes.get(base.sourceBase + "p0").kind, "external");
  assert.equal(
    r.routes.get(base.sourceBase + "p0").terminal,
    base.sourceBase + "p50000",
  );
});
test("absence clics, zéro, invalide, entier groupé et sécurité numérique", () => {
  assert.deepEqual(clicks("0"), { value: 0, state: "known" });
  assert.equal(clicks("1\u202f000").value, 1000);
  for (const v of ["1,000", "1.0", "-1", "inconnu", "1 00", "9007199254740992"])
    assert.equal(clicks(v).state, "invalid");
  for (const inv of [
    "url\n/a",
    "url;clicks\n/a;0",
    "url;clicks\n/a;inconnu",
    "url;clicks\n/a;",
  ])
    assert.equal(
      run(plan("/a;keep;;;"), inv, base).metrics.unresolvedShare,
      null,
    );
  const r = run(
    plan("/a;keep;;;\n/b;keep;;;"),
    "url;clicks\n/a;9007199254740991\n/b;1",
    base,
  );
  assert.equal(r.metrics.clicksSafe, false);
  assert.equal(r.metrics.unresolvedShare, null);
});
test("doublons inventaire et URL invalides suspendent les pourcentages", () => {
  for (const inv of [
    "url;clicks\n/a;50\n/a;60",
    "url;clicks\n/a;50\njavascript:bad;60",
    "url;clicks",
  ]) {
    const r = run(plan("/a;keep;;;"), inv, base);
    assert.equal(r.metrics.calculable, false);
    assert.equal(r.metrics.coverage, null);
  }
  assert.equal(
    run(plan("javascript:bad;keep;;;"), "url\n/a", base).metrics.calculable,
    false,
  );
});
test("clics manquants : pourcentage sur clics connus uniquement", () => {
  const r = run(
    plan("/a;keep;;;"),
    "url;clicks\n/a;50\n/b;50\n/c;\n/d;inconnu",
    base,
  );
  assert.equal(r.metrics.unresolvedShare, 50);
  assert.equal(r.metrics.missingClicks, 1);
  assert.equal(r.metrics.invalidClicks, 1);
});
test("CSV BOM, multiligne, CRLF, quotes, séparateurs et homonymes", () => {
  const p = parse(
    '\uFEFFurl;note;note\r\n"/a";"premier; second\r\nligne";"un ""mot"""\r\n',
  );
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0][1], "premier; second\r\nligne");
  assert.equal(p.rows[0][2], 'un "mot"');
  assert.deepEqual(p.headers, ["url", "note", "note"]);
  assert.equal(parse("url\tclicks\n/a\t0").delimiter, "\t");
  assert.equal(parse("url,clicks\n/a,0").delimiter, ",");
  assert.equal(suggest(["url", "url"], "inventory").url, -1);
  assert.throws(() => decode(new Uint8Array([0xc3, 0x28]).buffer), /UTF-8/);
});
test("parsing incorrect garde la prévisualisation et bloque les indicateurs", () => {
  const inv = "url;clicks\n/a;1\n/b;2;extra";
  const r = run(plan("/a;keep;;;"), inv, base);
  assert.equal(r.inventory.length, 2);
  assert.equal(r.metrics.coverage, null);
  assert(parse('url;note\n/a;"non fermé').errors.length > 0);
});
test("URL conservatrices, bases distinctes et transformations traçables", () => {
  assert.equal(
    normalize("/page", "https://a.example/dir/").key,
    "https://a.example/page",
  );
  assert.equal(
    normalize("../page", "https://a.example/dir/").key,
    "https://a.example/page",
  );
  assert.equal(normalize("/page").key, null);
  assert.equal(
    normalize(" HTTP://EXAMPLE.COM:80/%aa?q=1#x ").key,
    "http://example.com/%AA?q=1",
  );
  assert.equal(normalize("https://x.example/a#f").fragment, "f");
  for (const [a, b] of [
    ["http://x.example/", "https://x.example/"],
    ["https://www.x.example/", "https://x.example/"],
    ["https://x.example/A", "https://x.example/a"],
    ["https://x.example/a", "https://x.example/a/"],
    ["https://x.example/?a=1&a=2", "https://x.example/?a=2&a=1"],
    ["https://x.example/a%2Fb", "https://x.example/a/b"],
    ["https://x.example/é", "https://x.example/%C3%A9"],
    ["https://x.example/%7e", "https://x.example/~"],
    ["https://x.example/a/../b", "https://x.example/b"],
  ])
    assert.notEqual(normalize(a).key, normalize(b).key);
  const r = run("source_url;target_url\n/a;/a", null, {
    sourceBase: "https://old.example/",
    targetBase: "https://new.example/",
  });
  assert.equal(r.plan[0].decision, "redirect");
});
test("URL dangereuses ou sérialisation ambiguë refusées", () => {
  for (const v of [
    "https://user:pass@x.example/",
    "javascript:alert(1)",
    "//x.example/a",
    "https://x.example/a\\b",
    "https://x.example/%xx",
    "https://127.1/a",
    "https://é.example/",
  ])
    assert.equal(normalize(v).key, null, v);
});
test("statuts, cibles incompatibles, décision inconnue", () => {
  const r = run(
    plan(
      "/a;keep;/b;200;\n/b;remove;/a;404;\n/c;redirect;;301;\n/d;remove;;301;\n/e;foo;;;",
    ),
    null,
    base,
  );
  assert(r.plan.every((x) => !x.complete));
  for (const c of [
    "TARGET_INCOMPATIBLE",
    "TARGET_MISSING",
    "STATUS_INCOMPATIBLE",
    "DECISION_UNKNOWN",
  ])
    assert(r.findings.some((x) => x.code === c));
});
test("variantes candidates ne gonflent pas la couverture", () => {
  const r = run(
    plan("https://www.a.example/a/;keep;;;"),
    "url\nhttps://www.a.example/a",
  );
  assert.equal(r.metrics.coverage, 0);
  assert.equal(r.inventory[0].candidates.length, 1);
});
test("exports conservent lignes/colonnes et exportent les absences", () => {
  const r = fixture();
  const exp = parse(exportPlan(r).text);
  assert.equal(exp.rows.length, 86);
  assert.deepEqual(exp.headers.slice(0, 5), r.planFile.headers);
  assert.equal(parse(exportUnresolved(r).text).rows.length, 14);
  assert(exportPlan(r).text.startsWith("\uFEFF"));
  const d = run(
    "source_url;decision;note;note;edikka_record\n/a;keep;X;Y;original",
    null,
    base,
  );
  const e = parse(exportPlan(d).text);
  assert.equal(e.headers[2], e.headers[3]);
  assert.equal(e.rows[0][4], "original");
  assert(e.headers.includes("edikka_record_2"));
});
test("neutralisation des formules et contrôles sans mutation des originaux", () => {
  for (const v of [
    "=1+1",
    "+cmd",
    "-1",
    "@sum",
    "\t=1",
    "\r=1",
    " \t+1",
    "\u0085test",
  ])
    assert(neutralize(v).changed, v);
  const r = run(
    'source_url;decision;note\n/a;keep;=HYPERLINK("https://sentinel.invalid")',
    null,
    base,
  );
  const text = exportPlan(r).text;
  assert(text.includes("'=HYPERLINK"));
  assert(r.plan[0].original[2].startsWith("="));
  assert(!manifest(r, {}, "test").rows);
});
test("résultats déterministes", () => {
  assert.equal(JSON.stringify(fixture()), JSON.stringify(fixture()));
});
test("formules précédées d’espaces Unicode et caractères invisibles", () => {
  for (const v of [
    "\u00a0=1",
    "\u202f+1",
    "\ufeff@sum",
    "\u200b=1",
    "\u200btexte",
  ])
    assert(neutralize(v).changed, v);
});
test("colonnes supplémentaires préservées sans collision", () => {
  const r = run(
    "source_url;decision;edikka_original_extra_1\n/a;keep;déjà;extra1;extra2",
    null,
    base,
  );
  const e = parse(exportPlan(r).text);
  assert.equal(e.rows[0][3], "extra1");
  assert.equal(e.rows[0][4], "extra2");
  assert.equal(new Set(e.headers).size, e.headers.length);
  assert.equal(e.headers[2], "edikka_original_extra_1");
});
test("plusieurs défauts restent rattachés à une même ligne", () => {
  const r = run(plan("/a;redirect;bad url;410;"), null, base);
  const codes = r.findings
    .filter((f) => f.planRows.includes(0))
    .map((f) => f.code);
  assert(codes.includes("TARGET_INVALID"));
  assert(codes.includes("TARGET_MISSING"));
  assert(codes.includes("STATUS_INCOMPATIBLE"));
});
test("somme non sûre non exportée comme dénominateur", () => {
  const r = run(
    plan("/a;keep;;;\n/b;keep;;;"),
    "url;clicks\n/a;9007199254740991\n/b;1",
    base,
  );
  assert.equal(r.metrics.knownClicks, null);
  assert.equal(r.metrics.unresolvedClicks, null);
  assert.equal(manifest(r, {}, "test").denominators.knownClicks, null);
});
test("limites de volume et mapping dupliqué refusés explicitement", () => {
  assert.throws(
    () =>
      parse(
        "url\n" + Array.from({ length: 50001 }, (_, i) => "/" + i).join("\n"),
      ),
    /50 000/,
  );
  const p = parse("source_url;decision\n/a;keep");
  assert.throws(
    () => analyze(p, { source_url: 0, decision: 0 }, null, {}, base),
    /un seul rôle/,
  );
  assert.throws(() => decode(new ArrayBuffer(20 * 1024 * 1024 + 1)), /20 Mio/);
});
test("suppression, conflit et lignes répétées restent intacts à l’export", () => {
  const r = run(f["plan-anomalies.csv"], f["inventaire-anomalies.csv"], base);
  const e = parse(exportPlan(r).text);
  assert.equal(e.rows.length, r.plan.length);
  assert.equal(e.rows.filter((x) => x[0] === "/conflit").length, 2);
  assert.equal(e.rows.filter((x) => x[0] === "/copie").length, 2);
  assert(e.rows.some((x) => x.includes("conflict")));
});
