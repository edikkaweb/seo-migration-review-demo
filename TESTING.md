# Recette exécutée — édition 1.0.0

3 octobre 2026. Les preuves de recette locale sont conservées sous `evidence/`. Les exécutions distantes et leur artefact de recette sont consultables dans [GitHub Actions](https://github.com/edikkaweb/seo-migration-review-demo/actions). Une réussite du build seule ne prouve pas le déploiement. Les captures utilisent des données fictives.

## Environnement

Node.js 22.12.0, TypeScript 6.0.3, esbuild 0.25.12, Papa Parse 5.5.3, Playwright 1.63.0, axe-core via @axe-core/playwright 4.10.2. macOS ; modèle CPU et version OS dans `evidence/benchmark.json`. Tests sur Google Chrome 154.0.8037.93 et Firefox Playwright 155.0, profils temporaires séparés des profils utilisateur.

## Moteur et construction

`npm run verify` exécute TypeScript strict, les tests Node et le build. 23 tests significatifs couvrent le corpus exact, sa version complète, ambiguïtés/inférences, keep/remove, conflits et prédécesseurs, cycles et chaînes, clics absents/invalides/nuls, CSV BOM/multiligne/quotes/homonymes/UTF-8 invalide, URL conservatives/bases distinctes, neutralisation des formules (contrôles et espaces Unicode), conservation des colonnes/lignes, limites et reproductibilité des résultats. Chaîne de 50 000 sauts incluse. Les résultats finaux sont enregistrés dans `evidence/verify.txt`.

Une première passe avait 15/17 réussites : les inventaires monocolonnes étaient bloqués à tort par l’alerte de détection de séparateur. Correction du parseur, sans affaiblissement des conclusions attendues. Les nouvelles protections portent la suite à 23 tests.

Le HTML initial est généré par le moteur et les mêmes fixtures que l’interaction ; aucun chiffre pédagogique n’est codé manuellement dans les composants. `build-manifest.json` contient octets et SHA-256 des fichiers livrables (hors lui-même). Les deux builds finaux sont comparés par empreinte. Le générateur ne lit aucun fichier utilisateur.

## Navigateurs sur le build de production

`npm run preview` puis `npm run test:browser`. Chromium et Firefox ont exécuté chacun les onze groupes de contrôles suivants sur `dist/` servi sous `/seo-migration-review-demo/` :

- Exemple 86/14/31, tri décroissant des URL à résoudre ; état complété ; corpus anomalies.
- Filtres sans changement des indicateurs, import personnel, mapping explicite d’en-têtes non reconnus, confirmation, analyse, trois téléchargements réellement sauvegardés et vérifiés.
- Changement de fichier : rapport antérieur masqué et signalé obsolète. Réimport puis remise à zéro sans rechargement réseau.
- Sentinelles `.invalid` et cellule `<img src=…>` : aucun élément HTML créé, aucun lien vers les valeurs importées, aucune requête durant import/analyse/affichage/export.
- Même parcours après `context.setOffline(true)`, page et worker déjà chargés.
- localStorage, sessionStorage, bases IndexedDB, service workers et cookies vides après le parcours personnel.
- Sans JavaScript : explication, chiffres 86/31 et six téléchargements utilisables. Aucun calcul interactif revendiqué sans JS.
- 320 et 390 pixels CSS sans débordement horizontal du document ; défilement des tables contenu. Mouvement réduit.
- axe sur résultats et imports : aucune violation ni résultat indéterminé dans les passes exécutées ; cela ne prouve pas une conformité globale.

`node tests/browser-extended.mjs` complète la recette : lien d’évitement au clavier, activation Enter, focus du résultat, bases relatives distinctes, plan seul, doublons bloquants, encodage invalide, clics inconnus/zéro, parsing partiel et pagination de 50 000 lignes. Détails et durée dans `evidence/browser-extended.json`.

## Réseau : interprétation exacte

La page et ses actifs locaux nécessitent une connexion initiale. La collecte des requêtes commence **après** chargement complet du worker. Aucune requête observée pour le parcours des fichiers sentinelles, en ligne et hors ligne. Les liens documentaires ne sont pas activés dans cette fenêtre. Les tests ne prétendent pas mesurer les communications internes du système d’exploitation ou du navigateur hors de la page.

La CSP meta inclut connect-src 'none', object-src 'none', form-action 'none', base-uri 'none', scripts/styles/workers locaux. Une balise meta ne remplace pas toutes les protections possibles d’un en-tête serveur ; pas de prétention à frame-ancestors via meta.

## Volume observé et limites

Deux CSV de 50 000 enregistrements, plan formant une chaîne de 50 000 sauts. Mesure Node initiale : parsing ~27 ms, analyse ~319 ms, exports ~350 ms, total ~696 ms ; mémoire heap finale ~541 Mo. Ce sont des mesures d’une machine de développement, sans garantie sur un téléphone ou une machine moins équipée.

Dans Chromium : import + mapping/confirmations automatisés + analyse des deux fichiers ~714 ms dans la passe initiale. Le heartbeat à 16 ms a connu un écart maximal de 154 ms : l’interface reste exploitable mais une pause transitoire existe, notamment lors des échanges/rendus. Aucune promesse de « zéro gel ». Les valeurs exactes finales et l’environnement sont dans les JSON de preuve. L’export d’un gros plan annoté peut être sensiblement plus lourd que son CSV d’entrée.

## Vérifications non acquises

Le premier essai Firefox et la première exécution CI ont échoué avant de charger la page : le port d’aperçu 4190 est réservé au protocole Sieve et bloqué par Firefox ([source Mozilla](https://bugzilla.mozilla.org/show_bug.cgi?id=1927546)). L’aperçu utilise maintenant 4179, sans modifier les protections du navigateur. La recette complète Chromium + Firefox passe localement ; `evidence/browser.json` conserve ce résultat, `evidence/browser-first-pass.json` le résultat initial défavorable. Les deux moteurs sont également exigés en CI avant tout déploiement. WebKit et Safari natif n’ont pas été validés.

Pas de session VoiceOver ou NVDA ; pas d’étude avec participants ; pas de téléphone physique. Le véritable zoom navigateur 200 % n’a pas été vérifié ; les largeurs CSS étroites sont vérifiées séparément et ne sont pas présentées comme un test de zoom. Aucun test de classement, trafic ou validité HTTP des URL importées. Les contrôles de publication (ressources HTTP et empreintes) sont distincts de ces contrôles fonctionnels.
