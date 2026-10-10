import { cell } from "./csv";
import { normalize } from "./url";
import type { CsvFile, Mapping, Options, PlanRow, Decision } from "./types";
export function planRows(
  file: CsvFile,
  map: Mapping,
  options: Options,
): PlanRow[] {
  return file.rows.map((original, id) => {
    const source = normalize(
        cell(original, map, "source_url"),
        options.sourceBase,
      ),
      targetText = cell(original, map, "target_url");
    const target = targetText.trim()
      ? normalize(targetText, options.targetBase)
      : { original: targetText, key: null, fragment: "", notes: [] };
    const raw = cell(original, map, "decision").trim().toLowerCase();
    const labels: Record<string, Decision> = {
      conserver: "keep",
      "rediriger 301": "redirect",
      "301 redirect": "redirect",
      consolider: "consolidate",
      "404": "remove",
      "410": "remove",
      "à analyser": "undecided",
      "to analyze": "undecided",
      investigate: "undecided",
    };
    let decision: Decision = labels[raw] ?? ([
      "keep",
      "redirect",
      "consolidate",
      "remove",
      "undecided",
    ].includes(raw)
      ? (raw as Decision)
      : raw
        ? "unknown"
        : "undecided");
    let origin: PlanRow["origin"] = raw ? "explicit" : "missing";
    if (!raw && target.key && source.key) {
      if (target.key === source.key) decision = "ambiguous";
      else {
        decision = "redirect";
        origin = "inferred";
      }
    }
    const status = cell(original, map, "planned_status").trim(),
      reason = cell(original, map, "reason");
    const issues: string[] = [];
    if (!source.key) issues.push("SOURCE_INVALID");
    if (target.error) issues.push("TARGET_INVALID");
    if (["redirect", "consolidate"].includes(decision) && !target.key)
      issues.push("TARGET_MISSING");
    if (decision === "unknown") issues.push("DECISION_UNKNOWN");
    if (decision === "ambiguous") issues.push("DECISION_AMBIGUOUS");
    if (decision === "undecided") issues.push("DECISION_PENDING");
    if (decision === "keep" && targetText.trim() && target.key !== source.key)
      issues.push("TARGET_INCOMPATIBLE");
    if (decision === "remove" && targetText.trim())
      issues.push("TARGET_INCOMPATIBLE");
    if (status) {
      const allowed =
        decision === "keep"
          ? ["200"]
          : decision === "remove"
            ? ["404", "410"]
            : ["redirect", "consolidate"].includes(decision)
              ? ["301", "302", "303", "307", "308"]
              : [];
      if (!allowed.includes(status)) issues.push("STATUS_INCOMPATIBLE");
      else if (["302", "303", "307"].includes(status))
        issues.push("TEMPORARY_STATUS");
    }
    if (
      decision === "redirect" &&
      source.key &&
      source.key === target.key &&
      origin === "explicit"
    )
      issues.push("SELF_REDIRECT");
    if (["remove", "consolidate"].includes(decision) && !reason.trim())
      issues.push("REASON_MISSING");
    if (origin === "inferred") issues.push("DECISION_INFERRED");
    const incomplete = [
      "SOURCE_INVALID",
      "TARGET_INVALID",
      "TARGET_MISSING",
      "DECISION_UNKNOWN",
      "DECISION_AMBIGUOUS",
      "DECISION_PENDING",
      "TARGET_INCOMPATIBLE",
      "STATUS_INCOMPATIBLE",
    ];
    return {
      id,
      record: file.records[id],
      original,
      source,
      target,
      decision,
      origin,
      status,
      reason,
      complete: !issues.some((x) => incomplete.includes(x)),
      issues,
    };
  });
}
