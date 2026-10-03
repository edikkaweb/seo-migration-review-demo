import { MAX_BYTES, type Mapping, type Options } from "./types";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const node = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  cls = "",
) => {
  const e = document.createElement(tag);
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
});
let serial = 0,
  epoch = 0,
  current = false,
  mode = "initial",
  page = 0,
  view = "unresolved",
  tableVersion = 0,
  ready = false;
const pending = new Map<
  number,
  { resolve: (x: any) => void; reject: (e: Error) => void }
>();
let fileVersions: Record<string, number> = { plan: 0, inventory: 0 };
let maps: Record<string, Mapping> = {},
  loaded: Record<string, any> = {},
  objectUrls = new Set<string>();
worker.onmessage = (e) => {
  if (e.data.id === 0) {
    ready = true;
    document
      .querySelectorAll<HTMLButtonElement>("button[data-ready]")
      .forEach((x) => (x.disabled = false));
    $("startup").textContent = "Prêt. Choisissez l’exemple ou vos fichiers.";
    return;
  }
  const p = pending.get(e.data.id);
  if (p) {
    pending.delete(e.data.id);
    e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.value);
  }
};
worker.onerror = () => {
  ready = false;
  status(
    "Le moteur local ne s’est pas chargé. Rechargez la page. Les explications et fichiers exemples restent accessibles.",
  );
  for (const p of pending.values())
    p.reject(new Error("Moteur local indisponible."));
  pending.clear();
};
function call(type: string, payload: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}
function status(text: string) {
  $("startup").textContent = text;
}
function error(text: string) {
  document
    .querySelectorAll<HTMLInputElement>("#imports input")
    .forEach((e) => e.setAttribute("aria-describedby", "errors"));
  const box = $("errors");
  box.replaceChildren(node("h3", "Vérifiez ces points"), node("p", text));
  box.hidden = false;
  box.focus();
  status("Une correction est nécessaire.");
}
function invalidate() {
  document
    .querySelectorAll<HTMLInputElement>("#imports input")
    .forEach((e) => e.removeAttribute("aria-describedby"));
  epoch++;
  current = false;
  $("busy").hidden = true;
  tableVersion++;
  $("results").hidden = true;
  $("errors").hidden = true;
  $("stale").hidden = mode === "initial";
  $("stale").textContent =
    "Résultats obsolètes : les entrées ont changé. Confirmez les colonnes puis relancez l’analyse.";
  for (const u of objectUrls) URL.revokeObjectURL(u);
  objectUrls.clear();
}
const options = (): Options => ({
  sourceBase: $<HTMLInputElement>("source-base").value,
  targetBase: $<HTMLInputElement>("target-base").value,
  homepage: $<HTMLInputElement>("homepage").value,
  threshold: 5,
});
function showMode(next: string) {
  document
    .querySelector(".hero")
    ?.classList.toggle("compact", next !== "initial");
  fileVersions.plan++;
  fileVersions.inventory++;
  mode = next;
  $("intro-example").hidden = next !== "initial";
  $("imports").hidden = next !== "personal";
  $("mode-label").textContent =
    next === "personal"
      ? "MES FICHIERS · traitement local"
      : next === "initial"
        ? "EXEMPLE REPRODUCTIBLE"
        : "EXEMPLE FICTIF · aucune donnée client";
}
async function example(which: string) {
  invalidate();
  showMode("example");
  const token = epoch;
  status("Analyse du corpus fictif…");
  try {
    const result = await call("example", which);
    if (token !== epoch) return;
    renderResult(result);
    status("Exemple analysé. Les chiffres proviennent du moteur.");
  } catch (e) {
    if (token === epoch) error((e as Error).message);
  }
}
$("example").onclick = () => example("main");
$("complete").onclick = () => example("completed");
$("anomalies").onclick = () => example("anomalies");
$("personal").onclick = async () => {
  invalidate();
  showMode("personal");
  $("stale").hidden = true;
  const token = epoch;
  await call("reset", null);
  if (token !== epoch) return;
  loaded = {};
  maps = {};
  for (const k of ["plan", "inventory"]) {
    $<HTMLInputElement>(k + "-file").value = "";
    $(k + "-preview").replaceChildren();
  }
  status("Importez le plan puis, si disponible, l’inventaire.");
  $("imports").focus();
};
$("reset").onclick = async () => {
  invalidate();
  showMode("initial");
  $("stale").hidden = true;
  loaded = {};
  maps = {};
  const token = epoch;
  await call("reset", null);
  if (token !== epoch) return;
  for (const e of document.querySelectorAll<HTMLInputElement>("input")) {
    if (e.type === "checkbox") e.checked = false;
    else e.value = "";
  }
  for (const k of ["plan", "inventory"]) $(k + "-preview").replaceChildren();
  for (const id of ["result-body", "metrics", "resolved", "errors", "active-files", "categories", "metric-note", "findings-summary", "page-info"]) {
    $(id).replaceChildren();
  }
  $<HTMLInputElement>("search").value = "";
  status(
    "Réinitialisé. Les références applicatives aux imports sont retirées.",
  );
  $("example").focus();
};
// Reset removes application references and object URLs; no forensic memory erasure is promised.
function preview(kind: string, data: any) {
  loaded[kind] = data;
  maps[kind] = data.mapping;
  const box = $(kind + "-preview");
  box.replaceChildren();
  const confirmed = $<HTMLInputElement>(kind + "-confirmed");
  confirmed.checked = false;
  box.append(
    node(
      "p",
      `${data.name} · ${data.rowCount} enregistrements · ${data.headers.length} colonnes. Aperçu des ${data.rows.length} premiers.`,
    ),
  );
  const label = node(
    "label",
    "Séparateur du " + (kind === "plan" ? "plan" : "fichier inventaire"),
  );
  const select = node("select");
  select.id = kind + "-separator";
  label.htmlFor = select.id;
  for (const [v, t] of [
    [";", "Point-virgule"],
    [",", "Virgule"],
    ["\t", "Tabulation"],
  ]) {
    const o = node("option", t);
    o.value = v;
    select.append(o);
  }
  select.value = data.delimiter;
  select.onchange = async () => {
    invalidate();
    const t = ++fileVersions[kind];
    try {
      const v = await call("separator", { kind, delimiter: select.value });
      if (t === fileVersions[kind]) preview(kind, v);
    } catch (e) {
      if (t === epoch) error((e as Error).message);
    }
  };
  box.append(label, select);
  const scroller = node("div", "", "table-scroll");
  scroller.tabIndex = 0;
  scroller.setAttribute("role", "region");
  scroller.setAttribute(
    "aria-label",
    "Aperçu " + kind + " à faire défiler horizontalement",
  );
  const table = node("table");
  table.append(
    node(
      "caption",
      "Données originales — enregistrements CSV (pas numéros de lignes physiques)",
    ),
  );
  const head = node("tr");
  for (const [i, h] of (data.headers as string[]).entries()) {
    const th = node("th", `${i + 1}. ${h || "(vide)"}`);
    th.scope = "col";
    head.append(th);
  }
  const thead = node("thead");
  thead.append(head);
  table.append(thead);
  const body = node("tbody");
  for (const row of data.rows) {
    const tr = node("tr");
    for (const c of row) tr.append(node("td", c));
    body.append(tr);
  }
  table.append(body);
  scroller.append(table);
  box.append(scroller);
  const grid = node("div", "", "mapping-grid");
  for (const field of Object.keys(data.mapping)) {
    const wrap = node("div"),
      lab = node(
        "label",
        (
          {
            source_url: "URL source *",
            target_url: "URL destination",
            decision: "Décision",
            planned_status: "Statut prévu",
            reason: "Justification",
            url: "URL inventaire *",
            clicks: "Clics",
          } as Record<string, string>
        )[field],
      ),
      s = node("select");
    s.id = kind + "-" + field;
    lab.htmlFor = s.id;
    const none = node("option", "Non utilisée");
    none.value = "-1";
    s.append(none);
    data.headers.forEach((h: string, i: number) => {
      const o = node("option", `${i + 1}. ${h || "(vide)"}`);
      o.value = String(i);
      s.append(o);
    });
    s.value = String(data.mapping[field]);
    s.onchange = () => {
      invalidate();
      maps[kind][field] = Number(s.value);
      confirmed.checked = false;
    };
    wrap.append(lab, s);
    grid.append(wrap);
  }
  box.append(grid);
  if (new Set(data.headers).size !== data.headers.length)
    box.append(
      node(
        "p",
        "En-têtes homonymes : les colonnes sont distinguées par leur position. Vérifiez chaque correspondance.",
        "notice",
      ),
    );
  if (data.errorCount) {
    box.append(
      node(
        "p",
        `${data.errorCount} erreur(s) CSV. Aperçu conservé ; les pourcentages seront suspendus.`,
        "warning",
      ),
    );
    const ul = node("ul");
    for (const e of data.errors)
      ul.append(node("li", `Enregistrement ${e.record} : ${e.message}`));
    box.append(ul);
  }
  status("Fichier lu. Confirmez les colonnes avant analyse.");
}
for (const kind of ["plan", "inventory"]) {
  $<HTMLInputElement>(kind + "-file").addEventListener("change", async (e) => {
    invalidate();
    delete loaded[kind];
    delete maps[kind];
    const t = ++fileVersions[kind],
      file = (e.target as HTMLInputElement).files?.[0];
    $(kind + "-preview").replaceChildren();
    if (!file) return;
    if (file.size > MAX_BYTES) {
      error("Limite de 20 Mio par fichier dépassée.");
      return;
    }
    status("Lecture du CSV dans le navigateur…");
    try {
      const bytes = await file.arrayBuffer();
      if (t !== fileVersions[kind]) return;
      const data = await call("load", { kind, name: file.name, bytes });
      if (t !== fileVersions[kind]) return;
      preview(kind, data);
      if (kind === "inventory")
        $<HTMLInputElement>("use-inventory").checked = true;
    } catch (e) {
      if (t === fileVersions[kind]) error((e as Error).message);
    }
  });
}
for (const e of document.querySelectorAll<HTMLInputElement>(
  "#settings input, #metadata input",
))
  e.oninput = () => invalidate();
$("resolve").onclick = async () => {
  const token = epoch;
  try {
    const data = await call("resolve", { maps, options: options() });
    if (token !== epoch) return;
    const list = $("resolved");
    list.replaceChildren();
    for (const [kind, rows] of Object.entries(data) as [string, any[]][])
      for (const r of rows) {
        list.append(
          node(
            "li",
            `${kind} : ${r.source.original} → ${r.source.key ?? r.source.error}${r.target ? " | destination : " + (r.target.key ?? r.target.error) : ""}`,
          ),
        );
      }
    if (!list.childElementCount)
      list.append(
        node(
          "li",
          "Importez et associez les colonnes pour voir les résolutions.",
        ),
      );
  } catch (e) {
    error((e as Error).message);
  }
};
$("analyze").onclick = async () => {
  if (!ready) return;
  invalidate();
  const t = epoch;
  const useInventory = $<HTMLInputElement>("use-inventory").checked;
  if (!loaded.plan) {
    error("Le plan CSV est obligatoire.");
    return;
  }
  if (
    !$<HTMLInputElement>("plan-confirmed").checked ||
    (useInventory &&
      (!$<HTMLInputElement>("inventory-confirmed").checked ||
        !loaded.inventory))
  ) {
    error("Confirmez les colonnes du plan et de l’inventaire choisi.");
    return;
  }
  status("Analyse en cours dans le moteur local…");
  $("busy").hidden = false;
  try {
    const r = await call("analyze", { maps, options: options(), useInventory });
    if (t !== epoch) return;
    renderResult(r);
    status("Analyse terminée. Consultez les décisions puis les anomalies.");
  } catch (e) {
    if (t === epoch) error((e as Error).message);
  } finally {
    if (t === epoch) $("busy").hidden = true;
  }
};
for (const id of ["use-inventory", "plan-confirmed", "inventory-confirmed"])
  $(id).onchange = () => invalidate();
const number = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const pct = (n: number | null) =>
  n === null ? "Non calculable" : number(n) + " %";
function renderResult(r: any) {
  current = true;
  $<HTMLInputElement>("search").value = "";
  $<HTMLSelectElement>("sort").value = "descending";
  $("stale").hidden = true;
  $("results").hidden = false;
  $("busy").hidden = true;
  $("active-files").textContent =
    `${mode === "personal" ? "Vos fichiers" : "Corpus fictif"} · ${r.planName} (${r.planCount} lignes)${r.inventoryName ? " + " + r.inventoryName + " (" + r.inventoryCount + " lignes)" : " · plan seul, couverture non mesurée"}`;
  const m = r.metrics,
    metrics = $("metrics");
  metrics.replaceChildren();
  const add = (value: string, label: string, note: string) => {
    const card = node("div", "", "metric");
    card.append(node("strong", value), node("h3", label), node("p", note));
    metrics.append(card);
  };
  if (m) {
    add(
      pct(m.coverage),
      "Décisions renseignées",
      m.calculable
        ? `${m.documented} / ${m.total} URL de l’inventaire`
        : "Import à corriger ; analyse partielle ci-dessous",
    );
    add(
      m.calculable ? number(m.unresolved) : "Non calculable",
      "URL à résoudre",
      m.calculable
        ? `${m.unresolved} / ${m.total} : absences, ambiguïtés ou décisions incomplètes`
        : "Dénominateur incomplet",
    );
    add(
      pct(m.unresolvedShare),
      "Clics associés aux URL à résoudre",
      m.calculable && m.clicksSafe
        ? `${number(m.unresolvedClicks)} / ${number(m.knownClicks)} parmi les clics renseignés`
        : "Somme indisponible ou non sûre",
    );
    $("metric-note").textContent =
      (m.reason ? m.reason + " " : "") +
      `${m.missingClicks} URL sans clics, ${m.invalidClicks} avec clics invalides (hors doublons / URL invalides). ` +
      (m.clicksSafe ? "" : "Somme des clics hors plage numérique sûre. ") +
      "Ces proportions concernent uniquement l’inventaire importé. Elles ne prédisent aucune perte de trafic.";
    const body = $("categories");
    body.replaceChildren();
    for (const [key, c] of Object.entries(m.categories) as [string, any][]) {
      const tr = node("tr");
      tr.append(
        node(
          "th",
          (
            {
              keep: "Conserver",
              redirect: "Rediriger",
              consolidate: "Regrouper",
              remove: "Supprimer",
              unresolved: "À résoudre",
            } as Record<string, string>
          )[key],
        ),
        node("td", m.calculable ? number(c.count) : "Suspendu"),
        node(
          "td",
          m.calculable && m.clicksSafe ? number(c.clicks) : "Suspendu",
        ),
        node(
          "td",
          m.calculable && m.clicksSafe && m.knownClicks > 0
            ? pct((100 * c.clicks) / m.knownClicks)
            : "Non calculable",
        ),
      );
      body.append(tr);
    }
    $("distribution").hidden = false;
  } else {
    add(
      "Plan seul",
      "Couverture non mesurée",
      "Ajoutez un inventaire pour retrouver les URL absentes du plan.",
    );
    $("metric-note").textContent =
      "Contrôles structurels uniquement. Un plan ne permet pas, seul, de connaître les URL oubliées.";
    $("distribution").hidden = true;
  }
  $("findings-summary").textContent =
    `${r.findings.error} constats d’erreur · ${r.findings.review} à examiner · ${r.findings.info} informations. Plusieurs constats peuvent concerner une même URL.`;
  $("no-rows").hidden = r.planCount > 0;
  $("partial").hidden = !(r.partial || (m && !m.calculable));
  $<HTMLButtonElement>("export-unresolved").disabled = !m;
  $<HTMLSelectElement>("table-view")
    .querySelectorAll<HTMLOptionElement>("option")
    .forEach(
      (o) => (o.disabled = !m && ["inventory", "unresolved"].includes(o.value)),
    );
  view = m ? "unresolved" : "plan";
  $<HTMLSelectElement>("table-view").value = view;
  page = 0;
  updateFilters();
  renderTable();
  $("results-heading").focus({ preventScroll: true });
  $("results").scrollIntoView({ block: "start", behavior: "instant" });
}
function updateFilters() {
  view = $<HTMLSelectElement>("table-view").value;
  const s = $<HTMLSelectElement>("filter");
  s.replaceChildren();
  for (const [v, t] of view === "findings"
    ? [
        ["all", "Tous les constats"],
        ["error", "Erreurs du plan"],
        ["review", "À examiner"],
        ["info", "Informations"],
      ]
    : [
        ["all", "Toutes les catégories"],
        ["unresolved", "À résoudre"],
        ["keep", "Conserver"],
        ["redirect", "Rediriger"],
        ["consolidate", "Regrouper"],
        ["remove", "Supprimer"],
      ]) {
    const o = node("option", t);
    o.value = v;
    s.append(o);
  }
  s.disabled = view === "unresolved";
}
async function renderTable() {
  if (!current) return;
  const token = epoch,
    version = ++tableVersion;
  try {
    const r = await call("table", {
      view,
      query: $<HTMLInputElement>("search").value,
      filter: $<HTMLSelectElement>("filter").value,
      sort: $<HTMLSelectElement>("sort").value,
      page,
    });
    if (token !== epoch || version !== tableVersion) return;
    page = r.page;
    const header = $("result-head");
    header.replaceChildren();
    const labels =
      view === "findings"
        ? ["Code", "Niveau", "Portée", "Constat"]
        : view === "plan"
          ? ["URL source originale", "Décision", "Origine", "Provenance"]
          : ["URL originale", "Motif", "Clics connus", "Provenance"];
    for (const label of [...labels, "Preuve"]) {
      const th = node("th", label);
      th.scope = "col";
      if (label === "Clics connus")
        th.setAttribute(
          "aria-sort",
          $<HTMLSelectElement>("sort").value === "ascending"
            ? "ascending"
            : $<HTMLSelectElement>("sort").value === "descending"
              ? "descending"
              : "none",
        );
      header.append(th);
    }
    const body = $("result-body");
    body.replaceChildren();
    for (const row of r.rows) {
      const tr = node("tr");
      for (const cell of row.cells) tr.append(node("td", cell));
      const td = node("td"),
        details = node("details"),
        summary = node("summary", "Voir la preuve");
      details.append(summary);
      for (const text of row.details) details.append(node("p", text));
      td.append(details);
      tr.append(td);
      body.append(tr);
    }
    if (!r.rows.length) {
      const tr = node("tr"),
        td = node(
          "td",
          "Aucun résultat pour cette vue et ces filtres. Les indicateurs globaux restent inchangés.",
        );
      td.colSpan = 5;
      tr.append(td);
      body.append(tr);
    }
    $("page-info").textContent =
      `${number(r.count)} résultat(s) · page ${page + 1} / ${r.pages}`;
    $<HTMLButtonElement>("previous").disabled = page === 0;
    $<HTMLButtonElement>("next").disabled = page + 1 >= r.pages;
  } catch (e) {
    if (token === epoch) error((e as Error).message);
  }
}
$("table-view").onchange = () => {
  page = 0;
  updateFilters();
  renderTable();
};
for (const id of ["filter", "sort"])
  $(id).onchange = () => {
    page = 0;
    renderTable();
  };
let timer: ReturnType<typeof setTimeout>;
$("search").oninput = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    page = 0;
    renderTable();
  }, 180);
};
$("previous").onclick = () => {
  page--;
  renderTable();
};
$("next").onclick = () => {
  page++;
  renderTable();
};
for (const kind of ["plan", "unresolved", "manifest"])
  $("export-" + kind).onclick = async () => {
    if (!current) return;
    const token = epoch;
    try {
      const metadata = Object.fromEntries(
        ["period", "property", "filters", "source"].map((id) => [
          id,
          mode === "personal"
            ? $<HTMLInputElement>("meta-" + id).value || "non renseignés"
            : "corpus fictif",
        ]),
      );
      const r = await call("export", {
        kind,
        delimiter: $<HTMLSelectElement>("export-separator").value,
        metadata,
        at: new Date().toISOString(),
      });
      if (token !== epoch || !current) return;
      const blob = new Blob([r.text], {
          type:
            kind === "manifest"
              ? "application/json;charset=utf-8"
              : "text/csv;charset=utf-8",
        }),
        url = URL.createObjectURL(blob);
      objectUrls.add(url);
      const a = node("a");
      a.href = url;
      a.download =
        kind === "plan"
          ? "plan-annote.csv"
          : kind === "unresolved"
            ? "urls-a-resoudre.csv"
            : "manifeste-revue.json";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        objectUrls.delete(url);
      }, 1000);
      status(
        `Export préparé : ${r.neutralized} cellule(s) neutralisée(s) contre les formules. Le fichier contient les données de votre projet.`,
      );
    } catch (e) {
      if (token === epoch) error((e as Error).message);
    }
  };
