# Revue de migration SEO · Edikka

**Votre plan de migration couvre-t-il vos URL importantes ?** Une application statique française pour rapprocher un plan CSV et un inventaire, expliquer les décisions manquantes et examiner les parcours prévus. Sans inscription, crawl, backend ou transmission des fichiers.

Le corpus fictif reproductible contient 100 URL et 10 000 clics. Le moteur retrouve 86 décisions renseignées, 14 URL absentes et 3 100 clics associés à ces absences (31 %). Le plan n’a ni boucle, chaîne ni conflit. Le second état atteint 100 % de couverture documentaire, sans prouver une migration réussie.

[Ouvrir la démonstration](https://edikkaweb.github.io/seo-migration-review-demo/) · [Bibliothèque Edikka](https://www.edikka.com/bibliotheque#github-lab) · [Insight Migration SEO](https://www.edikka.com/insights/seo/migration-seo-refonte-site-internet#seo-migration-review-demo)

## Démarrage

Node.js ≥ 22.12.0, npm. Depuis ce dossier :

```sh
npm ci
npm run verify
npm run preview
```

Ouvrir `http://127.0.0.1:4190/seo-migration-review-demo/`. L’aperçu sert exclusivement `dist/` sous le sous-répertoire prévu pour GitHub Pages. `PORT=4191 npm run preview` permet un autre port. Une ouverture directe en `file://` ne charge pas les workers de manière fiable : utiliser l’aperçu HTTP.

- **Ouvrir l’exemple** : résultats calculés et preuves.
- **Mes fichiers CSV** : importer, vérifier séparateur et correspondance des colonnes, préciser les bases des URL relatives, confirmer puis analyser.
- **Exporter** : plan annoté + URL à résoudre + manifeste facultatif. Corriger dans le tableur puis réimporter.

Plan : `source_url,decision,target_url,planned_status,reason`. Seule source_url est toujours requise. Les colonnes ancienne/nouvelle URL peuvent être associées manuellement. Inventaire : `url,clicks`, clics facultatifs. Les en-têtes homonymes sont conservés et numérotés.

CSV UTF-8 avec/sans BOM, virgule/point-virgule/tabulation, CRLF/LF, champs cités et multilignes. Ni Excel, ZIP, API Search Console ni syntaxe Apache/nginx. Limites : 50 000 enregistrements hors en-tête, 20 Mio, 128 colonnes par fichier. La capacité mesurée figure dans [TESTING](TESTING.md).

## Commandes

```sh
npm run typecheck       # TypeScript strict
npm test                # moteur, imports, URL, export, 50 000 sauts
npm run fixtures        # générateur déterministe
npm run build           # dist + HTML initial calculé depuis le même moteur
npm run benchmark       # mesure locale parseur/moteur/exports
npm run test:browser    # aperçu actif ; Chromium + Firefox, réseau/hors ligne
```

Installer les moteurs de test si nécessaire : `npx playwright install chromium firefox`. Par défaut macOS utilise Chrome installé pour Chromium ; en CI les moteurs Playwright sont employés. Les données de tests sont synthétiques. `ENGINE=firefox npm run test:browser` limite un diagnostic à un moteur.

## Architecture et confidentialité

TypeScript sans framework. Papa Parse 5.5.3 est la seule dépendance embarquée. esbuild produit `app.js` et `worker.js`, tous deux locaux. Le moteur est indépendant du DOM. Parsing, rapprochement, graphe, résultats filtrés et exports sont exécutés dans le worker. Aucune police distante, CDN ou télémétrie.

Les fichiers restent en mémoire. Ni localStorage, sessionStorage, IndexedDB, cookie applicatif ni service worker. Aucune URL importée n’est cliquable ou chargée. La remise à zéro retire les références et révoque les URL objet, sans promettre d’effacement forensique. Un téléchargement volontaire contient des données du projet.

Le rapport devient obsolète dès que les entrées changent. Les pourcentages sont suspendus si le dénominateur n’est pas fiable. Les clics inconnus ne valent pas zéro. Le manifeste n’embarque pas les lignes CSV mais inclut noms des fichiers, contexte saisi et bases déclarées.

## Publication

Le dépôt public est [edikkaweb/seo-migration-review-demo](https://github.com/edikkaweb/seo-migration-review-demo). Le workflow contrôle le moteur, construit les fichiers statiques, teste Chromium et Firefox, puis publie exclusivement `dist/` sur GitHub Pages. Le statut de la livraison est consultable dans [Actions](https://github.com/edikkaweb/seo-migration-review-demo/actions). Voir [DEPLOYMENT](docs/DEPLOYMENT.md) pour reproduire la publication. Aucun fichier CSV utilisateur ne doit être ajouté au dépôt.

Documentation : [METHOD](METHOD.md), [TESTING](TESTING.md), [CHANGELOG](CHANGELOG.md), [texte de bibliothèque](docs/LIBRARY-COPY.md). Le code original est fourni sous MIT avec attribution Edikka ; licences des dépendances conservées dans [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md).
