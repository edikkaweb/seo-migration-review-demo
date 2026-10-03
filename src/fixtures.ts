import Papa from "papaparse";
const make = (headers: string[], rows: (string | number)[][]) =>
  Papa.unparse([headers, ...rows], {
    delimiter: ";",
    newline: "\r\n",
    quotes: true,
  });
export function fixtures() {
  const ph = [
      "source_url",
      "decision",
      "target_url",
      "planned_status",
      "reason",
    ],
    ih = ["url", "clicks"];
  const p: (string | number)[][] = [],
    i: (string | number)[][] = [];
  const url = (n: number) =>
    `https://ancien.atelier.example/page-${String(n).padStart(3, "0")}`;
  for (let n = 1; n <= 100; n++) {
    const clicks =
      n <= 60
        ? 60
        : n <= 78
          ? 100
          : n <= 83
            ? 200
            : n === 84
              ? 100
              : n === 85
                ? 150
                : n === 86
                  ? 250
                  : n === 100
                    ? 500
                    : 200;
    i.push([url(n), clicks]);
    if (n <= 60) p.push([url(n), "keep", "", "200", "Contenu conservé"]);
    else if (n <= 78)
      p.push([
        url(n),
        "redirect",
        `https://nouveau.atelier.example/service-${n}`,
        "301",
        "Déplacement vers une page dédiée",
      ]);
    else if (n <= 83)
      p.push([
        url(n),
        "consolidate",
        "https://nouveau.atelier.example/guide",
        "301",
        "Cinq fiches réunies dans un guide prévu",
      ]);
    else if (n <= 86)
      p.push([url(n), "remove", "", "410", "Retrait volontaire documenté"]);
  }
  const completed = [
    ...p,
    ...Array.from({ length: 14 }, (_, k) => [
      url(k + 87),
      "keep",
      "",
      "200",
      "Décision ajoutée au plan fictif",
    ]),
  ];
  const a = [
    ["/a", "redirect", "/b", "301", ""],
    ["/b", "redirect", "/a", "301", ""],
    ["/vers-boucle", "redirect", "/a", "301", ""],
    ["/depart", "redirect", "/etape", "301", ""],
    ["/etape", "redirect", "/arrivee", "301", ""],
    ["/arrivee", "keep", "", "200", ""],
    ["/conflit", "redirect", "/x", "301", ""],
    ["/conflit", "remove", "", "410", "Retrait"],
    ["/avant-conflit", "redirect", "/conflit", "301", ""],
    ["/auto", "redirect", "/auto", "301", ""],
    ["/perimee", "remove", "", "410", "Retrait assumé"],
    ["/vers-perimee", "redirect", "/perimee", "301", ""],
    ["/copie", "keep", "", "200", ""],
    ["/copie", "keep", "", "200", ""],
    ...Array.from({ length: 5 }, (_, n) => [
      "/fiche-" + n,
      "consolidate",
      "/guide",
      "301",
      "Fusion documentée",
    ]),
    ["/guide", "keep", "", "200", ""],
  ];
  return {
    "plan-exemple.csv": make(ph, p),
    "inventaire-exemple.csv": make(ih, i),
    "plan-complete.csv": make(ph, completed),
    "plan-anomalies.csv": make(ph, a),
    "inventaire-anomalies.csv": make(ih, [
      ...Array.from(new Set(a.map((x) => x[0])), (u, n) => [
        u,
        n === 0 ? "inconnu" : n === 1 ? "" : n * 10,
      ]),
      ["/sans-decision", 150],
    ]),
  };
}
