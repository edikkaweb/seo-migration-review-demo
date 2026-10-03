import { parse, decode, suggest } from "./csv";
import { analyze } from "./engine";
import { fixtures } from "./fixtures";
import { exportPlan, exportUnresolved, manifest } from "./export";
import { normalize } from "./url";
import { routePath } from "./graph";
import type { CsvFile, Mapping, Report } from "./types";
const scope = self as unknown as DedicatedWorkerGlobalScope;
let files: Record<string, { text: string; file: CsvFile }> = {},
  report: Report | null = null;
function preview(file: CsvFile, kind: "plan" | "inventory") {
  return {
    ...file,
    rows: file.rows.slice(0, 5),
    records: file.records.slice(0, 5),
    errors: file.errors.slice(0, 20),
    errorCount: file.errors.length,
    rowCount: file.rows.length,
    mapping: suggest(file.headers, kind),
  };
}
function summary(r: Report) {
  return {
    metrics: r.metrics,
    planCount: r.plan.length,
    inventoryCount: r.inventory.length,
    findings: {
      error: r.findings.filter((f) => f.severity === "error").length,
      review: r.findings.filter((f) => f.severity === "review").length,
      info: r.findings.filter((f) => f.severity === "info").length,
    },
    planName: r.planFile.name,
    inventoryName: r.inventoryFile?.name ?? "",
    partial: !!(
      r.planFile.errors.length ||
      r.inventoryFile?.errors.length ||
      r.plan.some((x) => !x.source.key) ||
      r.inventory.some((x) => !x.url.key)
    ),
    options: r.options,
  };
}
scope.onmessage = (event) => {
  const { id, type, payload } = event.data;
  try {
    let value: unknown;
    if (type === "reset") {
      files = {};
      report = null;
      value = true;
    } else if (type === "load") {
      report = null;
      const text = decode(payload.bytes);
      const file = parse(text, payload.name);
      files[payload.kind] = { text, file };
      value = preview(file, payload.kind);
    } else if (type === "separator") {
      report = null;
      const entry = files[payload.kind];
      entry.file = parse(entry.text, entry.file.name, payload.delimiter);
      value = preview(entry.file, payload.kind);
    } else if (type === "resolve") {
      value = Object.fromEntries(
        Object.entries(payload.maps as Record<string, Mapping>)
          .filter(([k]) => files[k])
          .map(([kind, map]) => {
            const field = kind === "plan" ? "source_url" : "url";
            return [
              kind,
              files[kind].file.rows
                .slice(0, 3)
                .map((row) => ({
                  source: normalize(
                    row[map[field]] ?? "",
                    payload.options.sourceBase,
                  ),
                  target:
                    kind === "plan" && map.target_url >= 0
                      ? normalize(
                          row[map.target_url] ?? "",
                          payload.options.targetBase,
                        )
                      : null,
                })),
            ];
          }),
      );
    } else if (type === "example") {
      report = null;
      const f = fixtures(),
        anomalies = payload === "anomalies";
      const pn = anomalies
          ? "plan-anomalies.csv"
          : payload === "completed"
            ? "plan-complete.csv"
            : "plan-exemple.csv",
        inn = anomalies ? "inventaire-anomalies.csv" : "inventaire-exemple.csv";
      const p = parse(f[pn], pn),
        i = parse(f[inn], inn);
      files = {};
      report = analyze(
        p,
        suggest(p.headers, "plan"),
        i,
        suggest(i.headers, "inventory"),
        anomalies
          ? {
              sourceBase: "https://anomalies.atelier.example/",
              targetBase: "https://anomalies.atelier.example/",
            }
          : {},
      );
      value = summary(report);
    } else if (type === "analyze") {
      const p = files.plan.file,
        i = payload.useInventory ? (files.inventory?.file ?? null) : null;
      report = analyze(
        p,
        payload.maps.plan,
        i,
        payload.maps.inventory,
        payload.options,
      );
      value = summary(report);
    } else if (type === "table") {
      if (!report) throw new Error("Aucun rapport actuel.");
      const r = report,
        query = payload.query.toLowerCase();
      let rows: {
        cells: string[];
        details: string[];
        weight: number | null;
        filter: string;
      }[] = [];
      if (payload.view === "findings") {
        rows = r.findings.map((f) => ({
          cells: [
            f.code,
            {
              error: "Erreur du plan",
              review: "À examiner",
              info: "Information",
            }[f.severity],
            String(f.affected) + " ligne(s)",
            f.message,
          ],
          details: [
            f.proof,
            "Plan : " +
              f.planRows
                .map((i) => `${r.planFile.name} #${r.plan[i].record}`)
                .join(", "),
            "Inventaire : " +
              f.inventoryRows
                .map(
                  (i) => `${r.inventoryFile?.name} #${r.inventory[i].record}`,
                )
                .join(", "),
            f.limit,
            "Action : " + f.action,
            "Référence : " +
              f.id +
              (f.affected > 20
                ? " ; références de lignes limitées à 20 ici, codes présents dans chaque ligne exportée."
                : ""),
          ],
          weight: null,
          filter: f.severity,
        }));
      } else if (payload.view === "plan") {
        rows = r.plan.map((p) => {
          const route = p.source.key ? r.routes.get(p.source.key) : undefined;
          const group = p.source.key ? r.groups.get(p.source.key) : undefined;
          return {
            cells: [
              p.source.original,
              p.decision,
              p.origin,
              `${r.planFile.name} #${p.record}`,
            ],
            details: [
              `Clé source : ${p.source.key ?? "invalide"} ; fragment : ${p.source.fragment || "absent"}`,
              `Destination originale : ${p.target.original || "aucune"} ; clé : ${p.target.key ?? "aucune"} ; fragment : ${p.target.fragment || "absent"}`,
              `Statut prévu : ${p.status || "non renseigné"} ; motif : ${p.reason || "non renseigné"}`,
              `Décision : ${group?.conflict ? "conflit" : p.complete ? "renseignée" : "à résoudre"}`,
              `Parcours : ${route?.kind ?? "invalide"} ; sauts : ${route?.hops ?? "non fini / indéterminé"} ; destination terminale : ${route?.terminal ?? "indéterminée"} ; HTTP réel inconnu`,
              p.source.key
                ? "Chemin (12 URL maximum) : " +
                  routePath(p.source.key, r.edges).keys.join(" → ")
                : "",
              `Constats : ${p.issues.join(", ") || "aucun"}`,
            ],
            weight: null,
            filter: group?.conflict || !p.complete ? "unresolved" : p.decision,
          };
        });
      } else {
        rows = r.inventory
          .filter(
            (i) => payload.view === "inventory" || i.category === "unresolved",
          )
          .map((i) => ({
            cells: [
              i.url.original,
              i.reason,
              i.clicks === null
                ? i.clicksState === "invalid"
                  ? "Invalide"
                  : "Non renseignés"
                : String(i.clicks),
              `${r.inventoryFile?.name} #${i.record}`,
            ],
            details: [
              `Clé : ${i.url.key ?? "invalide"} ; fragment : ${i.url.fragment || "absent"}`,
              `Catégorie : ${i.category}`,
              `Plan : ${i.planRows.map((n) => r.plan[n].record).join(", ") || "aucune ligne correspondante"} ; références limitées à 20`,
              `Candidats non validés : ${i.candidates.join(" ; ") || "aucun"}`,
              `Constats : ${i.issues.join(", ") || "aucun"}`,
            ],
            weight: i.clicks,
            filter: i.category,
          }));
      }
      rows = rows.filter(
        (x) =>
          (payload.filter === "all" || x.filter === payload.filter) &&
          (!query ||
            [...x.cells, ...x.details].join(" ").toLowerCase().includes(query)),
      );
      if (
        payload.sort !== "source" &&
        payload.view !== "findings" &&
        payload.view !== "plan"
      )
        rows.sort((a, b) =>
          a.weight === null
            ? b.weight === null
              ? 0
              : 1
            : b.weight === null
              ? -1
              : payload.sort === "ascending"
                ? a.weight - b.weight
                : b.weight - a.weight,
        );
      else if (payload.sort === "source")
        rows.sort((a, b) =>
          a.cells[0] < b.cells[0] ? -1 : a.cells[0] > b.cells[0] ? 1 : 0,
        );
      const pages = Math.max(1, Math.ceil(rows.length / 25)),
        page = Math.min(payload.page, pages - 1);
      value = {
        rows: rows.slice(page * 25, page * 25 + 25),
        count: rows.length,
        pages,
        page,
      };
    } else if (type === "export") {
      if (!report) throw new Error("Rapport absent ou obsolète.");
      value =
        payload.kind === "manifest"
          ? {
              text: JSON.stringify(
                manifest(report, payload.metadata, payload.at),
                null,
                2,
              ),
              neutralized: 0,
            }
          : payload.kind === "plan"
            ? exportPlan(report, payload.delimiter)
            : exportUnresolved(report, payload.delimiter);
    } else throw new Error("Opération inconnue.");
    scope.postMessage({ id, value });
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : "Échec de l’analyse.",
    });
  }
};
scope.postMessage({ id: 0, value: "ready" });
