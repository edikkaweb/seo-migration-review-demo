import Papa from "papaparse";
import { VERSION, METHOD_VERSION, type Report } from "./types";
export function neutralize(value: unknown): {
  value: string;
  changed: boolean;
} {
  const text = String(value ?? "");
  const dangerous =
    /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(text) || /^[\p{Cc}\p{Cf}]/u.test(text);
  return { value: dangerous ? "'" + text : text, changed: dangerous };
}
export function csv(
  headers: string[],
  rows: unknown[][],
  delimiter = ";",
): { text: string; neutralized: number } {
  let count = 0;
  const safe = (x: unknown) => {
    const n = neutralize(x);
    if (n.changed) count++;
    return n.value;
  };
  const text =
    "\uFEFF" +
    Papa.unparse([headers.map(safe), ...rows.map((r) => r.map(safe))], {
      delimiter,
      newline: "\r\n",
      quotes: true,
    });
  return { text, neutralized: count };
}
function names(original: string[], added: string[]): string[] {
  const used = new Set(original);
  return added.map((k) => {
    let name = "edikka_" + k,
      n = 2;
    while (used.has(name)) name = "edikka_" + k + "_" + n++;
    used.add(name);
    return name;
  });
}
export function exportPlan(r: Report, delimiter = ";") {
  const added = [
    "record",
    "file",
    "source_key",
    "source_fragment",
    "target_key",
    "target_fragment",
    "decision",
    "decision_origin",
    "state",
    "finding_codes",
    "finding_explanations",
    "terminal",
    "planned_hops",
    "route_group",
    "known_clicks",
    "neutralized_columns",
  ];
  const width = Math.max(
    r.planFile.headers.length,
    ...r.plan.map((x) => x.original.length),
  );
  const extras = names(
    r.planFile.headers,
    Array.from(
      { length: width - r.planFile.headers.length },
      (_, i) => "original_extra_" + (i + 1),
    ),
  );
  const originals = [...r.planFile.headers, ...extras];
  const headers = [...originals, ...names(originals, added)];
  const findings = new Map(r.findings.map((x) => [x.id, x]));
  const inv = new Map<string, number | null>();
  for (const i of r.inventory)
    if (i.url.key) {
      if (inv.has(i.url.key)) inv.set(i.url.key, null);
      else inv.set(i.url.key, i.clicks);
    }

  const rows = r.plan.map((p) => {
    const f = p.issues.map((id) => findings.get(id)!),
      route = p.source.key ? r.routes.get(p.source.key) : undefined,
      g = p.source.key ? r.groups.get(p.source.key) : undefined;
    const values: unknown[] = [...p.original];
    while (values.length < width) values.push("");
    values.push(
      p.record,
      r.planFile.name,
      p.source.key,
      p.source.fragment,
      p.target.key,
      p.target.fragment,
      p.decision,
      p.origin,
      g?.conflict ? "conflict" : p.complete ? "documented" : "unresolved",
      f.map((x) => x.code).join("|"),
      f.map((x) => `${x.id} ${x.message} : ${x.proof}`).join("\n"),
      route?.terminal,
      route?.hops,
      route?.group,
      p.source.key ? inv.get(p.source.key) : null,
    );
    values.push(
      values
        .map((v, i) => (neutralize(v).changed ? String(i + 1) : ""))
        .filter(Boolean)
        .join("|"),
    );
    return values;
  });
  return csv(headers, rows, delimiter);
}
export function exportUnresolved(r: Report, delimiter = ";") {
  const file = r.inventoryFile;
  const original = file?.headers ?? [];
  const added = [
    "record",
    "file",
    "url_key",
    "fragment",
    "known_clicks",
    "clicks_state",
    "reason",
    "plan_records",
    "unvalidated_candidates",
    "neutralized_columns",
  ];
  const width = Math.max(
    original.length,
    0,
    ...r.inventory.map((x) => x.original.length),
  );
  const extras = names(
    original,
    Array.from(
      { length: width - original.length },
      (_, i) => "original_extra_" + (i + 1),
    ),
  );
  const headers = [
    ...original,
    ...extras,
    ...names([...original, ...extras], added),
  ];
  return csv(
    headers,
    r.inventory
      .filter((x) => x.category === "unresolved")
      .map((i) => {
        const values: unknown[] = [...i.original];
        while (values.length < width) values.push("");
        values.push(
          i.record,
          file?.name,
          i.url.key,
          i.url.fragment,
          i.clicks,
          i.clicksState,
          i.reason,
          i.planRows.map((n) => r.plan[n].record).join("|"),
          i.candidates.join("|"),
        );
        values.push(
          values
            .map((v, n) => (neutralize(v).changed ? String(n + 1) : ""))
            .filter(Boolean)
            .join("|"),
        );
        return values;
      }),
    delimiter,
  );
}
export function manifest(
  r: Report,
  metadata: Record<string, string>,
  exportedAt: string,
) {
  return {
    application: VERSION,
    method: METHOD_VERSION,
    exportedAt,
    metadata,
    settings: r.options,
    files: { plan: r.planFile.name, inventory: r.inventoryFile?.name ?? null },
    denominators: r.metrics
      ? {
          validUniqueUrls: r.metrics.total,
          calculable: r.metrics.calculable,
          knownClicks: r.metrics.clicksSafe ? r.metrics.knownClicks : null,
          missingClicks: r.metrics.missingClicks,
          invalidClicks: r.metrics.invalidClicks,
        }
      : null,
    limits: [
      "Plan déclaré uniquement ; aucun HTTP ni trafic prédit.",
      "Données du projet : conserver les rapports avec précaution.",
    ],
  };
}
