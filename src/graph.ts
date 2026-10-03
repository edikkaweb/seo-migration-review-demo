import type { Group, Route } from "./types";
export function graph(groups: Map<string, Group>): {
  routes: Map<string, Route>;
  edges: Map<string, string>;
} {
  const edges = new Map<string, string>();
  for (const [key, g] of groups)
    if (
      !g.conflict &&
      g.row.complete &&
      ["redirect", "consolidate"].includes(g.row.decision) &&
      g.row.target.key
    )
      edges.set(key, g.row.target.key);
  const routes = new Map<string, Route>();
  for (const start of groups.keys()) {
    if (routes.has(start)) continue;
    let key = start;
    const path: string[] = [],
      seen = new Map<string, number>();
    while (!routes.has(key)) {
      const cycleAt = seen.get(key);
      if (cycleAt !== undefined) {
        const members = path.slice(cycleAt);
        const group = "cycle:" + members.reduce((a, b) => (a < b ? a : b));
        for (const m of members)
          routes.set(m, {
            kind: "cycle",
            terminal: null,
            hops: null,
            group,
            distance: 0,
            cycleLength: members.length,
          });
        path.length = cycleAt;
        break;
      }
      seen.set(key, path.length);
      path.push(key);
      const g = groups.get(key),
        next = edges.get(key);
      if (next) {
        key = next;
        continue;
      }
      const kind = !g
        ? "external"
        : g.conflict
          ? "conflict"
          : !g.row.complete
            ? g.row.decision === "undecided"
              ? "undecided"
              : "incomplete"
            : g.row.decision;
      routes.set(key, {
        kind,
        terminal: ["keep", "remove", "external"].includes(kind) ? key : null,
        hops: 0,
        group: `${kind}:${key}`,
        distance: 0,
        cycleLength: 0,
      });
      break;
    }
    for (let i = path.length - 1; i >= 0; i--) {
      const k = path[i];
      if (routes.has(k)) continue;
      const r = routes.get(edges.get(k)!)!;
      routes.set(k, {
        ...r,
        hops: r.hops === null ? null : r.hops + 1,
        distance: r.distance + 1,
      });
    }
  }
  return { routes, edges };
}
export function routePath(
  start: string,
  edges: Map<string, string>,
  limit = 12,
): { keys: string[]; truncated: boolean } {
  const keys = [start],
    seen = new Set([start]);
  let key = start;
  while (edges.has(key) && keys.length < limit) {
    key = edges.get(key)!;
    keys.push(key);
    if (seen.has(key)) return { keys, truncated: false };
    seen.add(key);
  }
  return { keys, truncated: edges.has(key) };
}
