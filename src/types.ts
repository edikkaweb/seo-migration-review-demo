export type Decision =
  | "keep"
  | "redirect"
  | "consolidate"
  | "remove"
  | "undecided"
  | "ambiguous"
  | "unknown";
export type Severity = "error" | "review" | "info";
export interface CsvFile {
  name: string;
  headers: string[];
  rows: string[][];
  records: number[];
  delimiter: string;
  errors: { record: number; message: string }[];
}
export type Mapping = Record<string, number>;
export interface UrlValue {
  original: string;
  key: string | null;
  fragment: string;
  notes: string[];
  error?: string;
}
export interface PlanRow {
  id: number;
  record: number;
  original: string[];
  source: UrlValue;
  target: UrlValue;
  decision: Decision;
  origin: "explicit" | "inferred" | "missing";
  status: string;
  reason: string;
  complete: boolean;
  issues: string[];
}
export interface InventoryRow {
  id: number;
  record: number;
  original: string[];
  url: UrlValue;
  clicks: number | null;
  clicksState: "known" | "missing" | "invalid";
  category: string;
  reason: string;
  planRows: number[];
  candidates: string[];
  issues: string[];
}
export interface Finding {
  id: string;
  code: string;
  severity: Severity;
  category: string;
  message: string;
  proof: string;
  limit: string;
  action: string;
  planRows: number[];
  inventoryRows: number[];
  affected: number;
}
export interface Group {
  key: string;
  rows: number[];
  row: PlanRow;
  conflict: boolean;
}
export interface Route {
  kind: string;
  terminal: string | null;
  hops: number | null;
  group: string;
  distance: number;
  cycleLength: number;
}
export interface Options {
  sourceBase: string;
  targetBase: string;
  homepage: string;
  threshold: number;
}
export interface Category {
  count: number;
  clicks: number;
}
export interface Metrics {
  calculable: boolean;
  reason: string;
  total: number;
  documented: number;
  unresolved: number;
  coverage: number | null;
  knownClicks: number | null;
  unresolvedClicks: number | null;
  unresolvedShare: number | null;
  missingClicks: number;
  invalidClicks: number;
  clicksSafe: boolean;
  categories: Record<string, Category>;
}
export interface Report {
  planFile: CsvFile;
  inventoryFile: CsvFile | null;
  plan: PlanRow[];
  inventory: InventoryRow[];
  findings: Finding[];
  groups: Map<string, Group>;
  routes: Map<string, Route>;
  edges: Map<string, string>;
  metrics: Metrics | null;
  options: Options;
}
export const VERSION = "1.0.0";
export const METHOD_VERSION = "1.0.0";
export const MAX_ROWS = 50_000;
export const MAX_BYTES = 20 * 1024 * 1024;
