import Papa from "papaparse";
import { MAX_ROWS, MAX_BYTES, type CsvFile, type Mapping } from "./types";
export function decode(bytes: ArrayBuffer): string {
  if (bytes.byteLength > MAX_BYTES)
    throw new Error("Fichier trop volumineux : limite de 20 Mio par fichier.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      "Encodage UTF-8 invalide. Réexportez le fichier en CSV UTF-8 ; aucun caractère n’a été remplacé.",
    );
  }
}
export function parse(
  text: string,
  name = "fichier.csv",
  delimiter = "",
): CsvFile {
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    throw new Error("Fichier trop volumineux : limite de 20 Mio.");
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    delimiter,
    delimitersToGuess: [",", ";", "\t"],
    skipEmptyLines: false,
  });
  const data = result.data;
  if (data.length > 1 && data.at(-1)?.length === 1 && data.at(-1)?.[0] === "")
    data.pop();
  if (data.length - 1 > MAX_ROWS)
    throw new Error(
      "Limite dépassée : 50 000 enregistrements par fichier (hors en-tête).",
    );
  const headers = data.shift() ?? [];
  const errors = result.errors
    .filter(
      (e) =>
        !(
          e.code === "UndetectableDelimiter" &&
          headers.length === 1 &&
          data.every((r) => r.length === 1)
        ),
    )
    .map((e) => ({
      record: typeof e.row === "number" ? e.row + 1 : 0,
      message: `${e.code} : ${e.message}`,
    }));
  if (headers.every((x) => !x.trim()))
    errors.push({ record: 1, message: "En-tête absent ou vide." });
  if (headers.length > 128)
    throw new Error("Limite dépassée : 128 colonnes par fichier.");
  data.forEach((r, i) => {
    if (r.length !== headers.length)
      errors.push({
        record: i + 2,
        message: `${r.length} cellules pour ${headers.length} colonnes.`,
      });
  });
  return {
    name,
    headers,
    rows: data,
    records: data.map((_, i) => i + 2),
    delimiter: result.meta.delimiter || delimiter || ",",
    errors,
  };
}
const aliases: Record<string, string[]> = {
  source_url: [
    "sourceurl",
    "ancienneurl",
    "oldurl",
    "source",
    "ancienne",
    "urlsource",
  ],
  target_url: [
    "targeturl",
    "nouvelleurl",
    "newurl",
    "destination",
    "nouvelle",
    "urldestination",
  ],
  decision: ["decision", "décision"],
  planned_status: ["plannedstatus", "httpattendu", "expectedhttp", "codehttp"],
  reason: ["reason", "motif", "justification", "preuves/contenusàreprendre", "evidence/contenttoretain"],
  url: [
    "url",
    "page",
    "pages",
    "toppages",
    "pageslespluspopulaires",
    "pageslesplusconsultées",
  ],
  clicks: ["clicks", "clics"],
};
export function suggest(
  headers: string[],
  kind: "plan" | "inventory",
): Mapping {
  const out: Mapping = {};
  for (const field of kind === "plan"
    ? ["source_url", "decision", "target_url", "planned_status", "reason"]
    : ["url", "clicks"]) {
    let found = headers
      .map((h, i) =>
        aliases[field].includes(h.toLowerCase().replace(/[ _-]/g, "")) ? i : -1,
      )
      .filter((i) => i >= 0);
    // An explicit HTTP column takes priority over a workflow Status/Statut.
    // Retain the legacy fallback only when no specific HTTP header exists.
    if (field === "planned_status" && found.length === 0) {
      found = headers.map((h, i) => ["statut", "status"].includes(h.trim().toLowerCase()) ? i : -1).filter(i => i >= 0);
    }
    out[field] = found.length === 1 ? found[0] : -1;
  }
  return out;
}
export function checkMapping(
  file: CsvFile,
  map: Mapping,
  kind: "plan" | "inventory",
): string[] {
  const errors: string[] = [];
  const required = kind === "plan" ? "source_url" : "url";
  if (
    !Number.isInteger(map[required]) ||
    map[required] < 0 ||
    map[required] >= file.headers.length
  )
    errors.push("Choisissez la colonne URL obligatoire.");
  const values = Object.values(map).filter((i) => i >= 0);
  if (new Set(values).size !== values.length)
    errors.push("Chaque colonne doit avoir un seul rôle.");
  if (values.some((i) => !Number.isInteger(i) || i >= file.headers.length))
    errors.push("Colonne inexistante.");
  return errors;
}
export const cell = (row: string[], map: Mapping, field: string) =>
  map[field] >= 0 ? (row[map[field]] ?? "") : "";
export function clicks(value: string): {
  value: number | null;
  state: "known" | "missing" | "invalid";
} {
  const v = value.trim();
  if (v === "") return { value: null, state: "missing" };
  if (!/^(?:\d+|\d{1,3}(?:[ \u00A0\u202F]\d{3})+)$/.test(v))
    return { value: null, state: "invalid" };
  const n = Number(v.replace(/[ \u00A0\u202F]/g, ""));
  return Number.isSafeInteger(n)
    ? { value: n, state: "known" }
    : { value: null, state: "invalid" };
}
