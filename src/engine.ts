import { cell, clicks, checkMapping } from "./csv";
import { normalize, variants } from "./url";
import { planRows } from "./decisions";
import { graph, routePath } from "./graph";
import { CODES } from "./codes";
import type {
  CsvFile,
  Mapping,
  Options,
  Report,
  Finding,
  Group,
  InventoryRow,
  Metrics,
} from "./types";
export const defaults: Options = {
  sourceBase: "",
  targetBase: "",
  homepage: "",
  threshold: 5,
};
export function analyze(
  planFile: CsvFile,
  planMap: Mapping,
  inventoryFile: CsvFile | null = null,
  inventoryMap: Mapping = {},
  settings: Partial<Options> = {},
): Report {
  const options = { ...defaults, ...settings };
  if (!Number.isInteger(options.threshold) || options.threshold < 2)
    throw new Error("Seuil de concentration : entier ≥ 2 requis.");
  const errors = [
    ...checkMapping(planFile, planMap, "plan"),
    ...(inventoryFile
      ? checkMapping(inventoryFile, inventoryMap, "inventory")
      : []),
  ];
  if (errors.length) throw new Error(errors.join(" "));
  const plan = planRows(planFile, planMap, options),
    findings: Finding[] = [],
    groups = new Map<string, Group>();
  let seq = 0;
  const add = (
    code: string,
    proof: string,
    p: number[] = [],
    i: number[] = [],
    affected = p.length + i.length,
  ) => {
    const c = CODES[code];
    const id = "F" + String(++seq).padStart(6, "0");
    findings.push({
      id,
      code,
      severity: c[0],
      category: c[1],
      message: c[2],
      proof,
      limit:
        "Constat sur les fichiers fournis, sans requête HTTP ni validation de pertinence.",
      action: c[3],
      planRows: p.slice(0, 20),
      inventoryRows: i.slice(0, 20),
      affected,
    });
    for (const n of p)
      if (!plan[n].issues.includes(id)) plan[n].issues.push(id);
    for (const n of i)
      if (inventory[n] && !inventory[n].issues.includes(id))
        inventory[n].issues.push(id);
  };
  const inventory: InventoryRow[] = inventoryFile
    ? inventoryFile.rows.map((original, id) => {
        const c = clicks(cell(original, inventoryMap, "clicks"));
        return {
          id,
          record: inventoryFile.records[id],
          original,
          url: normalize(
            cell(original, inventoryMap, "url"),
            options.sourceBase,
          ),
          clicks: c.value,
          clicksState: c.state,
          category: "unresolved",
          reason: "",
          planRows: [],
          candidates: [],
          issues: [],
        };
      })
    : [];
  for (const row of plan) {
    const codes = [...row.issues];
    row.issues = [];
    for (const code of codes)
      add(
        code,
        `${planFile.name} · enregistrement ${row.record} · ${row.source.original} → ${row.target.original}${row.source.error ? " · " + row.source.error : ""}${row.target.error ? " · " + row.target.error : ""}`,
        [row.id],
      );
    for (const value of [row.source, row.target])
      for (const note of value.notes)
        add(
          note,
          `${value.original} → ${value.key ?? "invalide"}${value.fragment ? " · fragment : " + value.fragment : ""}`,
          [row.id],
        );
    if (row.source.key) {
      const g = groups.get(row.source.key);
      if (g) g.rows.push(row.id);
      else
        groups.set(row.source.key, {
          key: row.source.key,
          rows: [row.id],
          row,
          conflict: false,
        });
    }
  }
  for (const g of groups.values())
    if (g.rows.length > 1) {
      const signatures = new Set(
        g.rows.map((i) => {
          const r = plan[i];
          return JSON.stringify([
            r.decision,
            r.target.key ?? r.target.original,
            r.status,
            r.complete,
          ]);
        }),
      );
      g.conflict = signatures.size > 1;
      add(
        g.conflict ? "PLAN_CONFLICT" : "PLAN_DUPLICATE",
        `${g.key} · ${g.rows.length} lignes · enregistrements ${g.rows
          .slice(0, 20)
          .map((i) => plan[i].record)
          .join(", ")}${g.rows.length > 20 ? "…" : ""}`,
        g.rows,
      );
    }
  const invKeys = new Map<string, number[]>();
  for (const row of inventory) {
    if (row.url.key) {
      const list = invKeys.get(row.url.key);
      if (list) list.push(row.id);
      else invKeys.set(row.url.key, [row.id]);
    } else
      add(
        "INVENTORY_INVALID",
        `${row.url.original} : ${row.url.error}`,
        [],
        [row.id],
      );
    for (const note of row.url.notes)
      add(note, `${row.url.original} → ${row.url.key}`, [], [row.id]);
    if (row.clicksState !== "known")
      add(
        row.clicksState === "invalid" ? "CLICKS_INVALID" : "CLICKS_MISSING",
        `Enregistrement ${row.record} : « ${cell(row.original, inventoryMap, "clicks")} »`,
        [],
        [row.id],
      );
  }
  let duplicateInventory = false;
  for (const [key, ids] of invKeys)
    if (ids.length > 1) {
      duplicateInventory = true;
      add(
        "INVENTORY_DUPLICATE",
        `${key} · ${ids.length} enregistrements. Aucun cumul.`,
        [],
        ids,
      );
    }
  const { routes, edges } = graph(groups);
  for (const [key, g] of groups) {
    if (inventoryFile && !invKeys.has(key)) add("PLAN_OUTSIDE", key, g.rows);
    if (!edges.has(key)) continue;
    const route = routes.get(key)!;
    const p = routePath(key, edges);
    const proof = `${p.keys.join(" → ")}${p.truncated ? " → …" : ""} · ${route.hops === null ? "nombre de sauts non fini" : route.hops + " saut(s) prévus"} · groupe ${route.group} · distance au groupe ${route.distance}${route.cycleLength ? " · cycle " + route.cycleLength + " URL" : ""}`;
    if (route.kind === "cycle") add("GRAPH_CYCLE", proof, g.rows);
    else if (["conflict", "incomplete", "undecided"].includes(route.kind))
      add("GRAPH_INDETERMINATE", proof, g.rows);
    if (route.hops !== null && route.hops > 1)
      add("GRAPH_CHAIN", proof, g.rows);
    if (edges.has(edges.get(key)!))
      add("TARGET_REDIRECTED", `${key} → ${edges.get(key)}`, g.rows);
    if (route.kind === "remove") add("TARGET_REMOVED", proof, g.rows);
  }
  for (const row of inventory) {
    const key = row.url.key,
      g = key ? groups.get(key) : undefined;
    row.planRows = g ? g.rows.slice(0, 20) : [];
    if (!key) row.reason = "URL d’inventaire invalide";
    else if (invKeys.get(key)!.length > 1)
      row.reason = "URL répétée dans l’inventaire";
    else if (!g) row.reason = "Absente du plan";
    else if (g.conflict) row.reason = "Décisions contradictoires";
    else if (!g.row.complete)
      row.reason =
        g.row.decision === "ambiguous"
          ? "Source = destination sans décision explicite"
          : g.row.decision === "undecided"
            ? "Décision à prendre"
            : "Décision incomplète ou invalide";
    else {
      row.category = g.row.decision;
      row.reason =
        "Décision renseignée (cohérence du parcours à vérifier séparément)";
    }
    if (row.category === "unresolved") {
      add(
        "INVENTORY_UNRESOLVED",
        `${row.url.original} · ${row.reason}`,
        [],
        [row.id],
      );
      if (key && !g) {
        row.candidates = variants(key).filter((v) => groups.has(v));
        if (row.candidates.length)
          add("MATCH_CANDIDATE", row.candidates.join(" ; "), [], [row.id]);
      }
    }
  }
  for (const [scope, selector] of [
    ["IMMEDIATE", (k: string) => edges.get(k)],
    ["TERMINAL", (k: string) => routes.get(k)?.terminal],
  ] as const) {
    const buckets = new Map<string, string[]>();
    for (const key of edges.keys()) {
      const t = selector(key);
      if (!t) continue;
      const b = buckets.get(t);
      if (b) b.push(key);
      else buckets.set(t, [key]);
    }
    for (const [target, keys] of buckets) {
      if (keys.length < options.threshold) continue;
      let sum = 0,
        safe = true,
        unknown = 0;
      const ids: number[] = [];
      for (const key of keys) {
        ids.push(...groups.get(key)!.rows);
        const inv = invKeys.get(key);
        if (inv?.length === 1 && inventory[inv[0]].clicks !== null) {
          if (sum > Number.MAX_SAFE_INTEGER - inventory[inv[0]].clicks!)
            safe = false;
          else sum += inventory[inv[0]].clicks!;
        } else unknown++;
      }
      const root = /^https?:\/\/[^/]+\/(?:\?.*)?$/.test(target),
        declared =
          options.homepage &&
          normalize(options.homepage, options.targetBase).key === target;
      add(
        "CONCENTRATION_" + scope,
        `${target} · ${keys.length} sources uniques · ${safe ? sum : "somme hors plage sûre"} clics connus${unknown ? " · " + unknown + " sources sans poids unique connu" : ""}${root ? " · racine d’un hôte" : ""}${declared ? " · accueil déclaré" : ""} · seuil de revue ${options.threshold} ; regroupement possiblement légitime.`,
        ids,
      );
    }
  }
  for (const [file, kind] of [
    [planFile, "plan"],
    [inventoryFile, "inventaire"],
  ] as const)
    if (file)
      for (const error of file.errors)
        add(
          "CSV_ERROR",
          `${kind} ${file.name} · enregistrement ${error.record} · ${error.message}`,
        );
  let metrics: Metrics | null = null;
  if (inventoryFile) {
    const block =
      inventoryFile.errors.length ||
      planFile.errors.length ||
      duplicateInventory ||
      inventory.some((x) => !x.url.key) ||
      plan.some((x) => !x.source.key);
    const categories: Metrics["categories"] = {};
    for (const k of ["keep", "redirect", "consolidate", "remove", "unresolved"])
      categories[k] = { count: 0, clicks: 0 };
    let knownClicks = 0,
      missingClicks = 0,
      invalidClicks = 0,
      clicksSafe = true;
    for (const row of inventory) {
      if (!row.url.key || invKeys.get(row.url.key)!.length !== 1) continue;
      categories[row.category].count++;
      if (row.clicks !== null) {
        if (knownClicks > Number.MAX_SAFE_INTEGER - row.clicks) {
          clicksSafe = false;
        } else {
          knownClicks += row.clicks;
        }
        if (
          categories[row.category].clicks <=
          Number.MAX_SAFE_INTEGER - row.clicks
        )
          categories[row.category].clicks += row.clicks;
        else clicksSafe = false;
      } else if (row.clicksState === "missing") missingClicks++;
      else invalidClicks++;
    }
    const total = invKeys.size,
      unresolved = categories.unresolved.count,
      documented = Object.entries(categories)
        .filter(([k]) => k !== "unresolved")
        .reduce((s, [, c]) => s + c.count, 0),
      calculable = !block && total > 0;
    metrics = {
      calculable,
      reason:
        total === 0
          ? "Inventaire vide : aucun dénominateur."
          : block
            ? "Non calculable tant que l’import n’est pas corrigé (CSV, URL ou doublons)."
            : "",
      total,
      documented,
      unresolved,
      coverage: calculable ? (100 * documented) / total : null,
      knownClicks: clicksSafe ? knownClicks : null,
      unresolvedClicks: clicksSafe ? categories.unresolved.clicks : null,
      unresolvedShare:
        calculable && clicksSafe && knownClicks > 0
          ? (100 * categories.unresolved.clicks) / knownClicks
          : null,
      missingClicks,
      invalidClicks,
      clicksSafe,
      categories,
    };
  }
  return {
    planFile,
    inventoryFile,
    plan,
    inventory,
    findings,
    groups,
    routes,
    edges,
    metrics,
    options,
  };
}
