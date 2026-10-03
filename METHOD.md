# Méthode de revue 1.0.0

Documentation 1.0.0 — 3 octobre 2026. Application 1.0.0. Auteur du code et des fixtures : Edikka / Bertrand Morel. Données d’exemple entièrement fictives, domaines `.example`.

## Mesure

N = nombre d’URL uniques valides de l’inventaire, après correction des erreurs bloquantes. Une décision renseignée est une décision unique, non contradictoire et syntaxiquement complète parmi keep, redirect, consolidate, remove. Une décision renseignée peut néanmoins former une boucle : les anomalies du plan et la couverture sont distinctes.

- Couverture = 100 × nombre de décisions renseignées / N.
- À résoudre = sources absentes + undecided + ambiguïtés + décisions invalides/incomplètes + conflits.
- Part des clics à résoudre = 100 × somme des clics connus des URL à résoudre / somme des clics connus des URL valides importées.
- Répartition par catégorie : effectif, clics connus et part des clics connus.

Aucune valeur lorsque le dénominateur est nul. Les pourcentages de couverture et pondération sont suspendus en présence d’erreurs CSV dans l’un des fichiers, d’URL invalides dans l’inventaire ou les sources du plan, ou de doublons d’inventaire. Des destinations invalides ne bloquent pas N : la décision correspondante reste à résoudre. Les lignes interprétables restent consultables comme analyse partielle. Les filtres n’altèrent jamais les indicateurs globaux.

Les clics sont des entiers non négatifs sûrs. Les groupes de trois chiffres séparés par espace, NBSP ou espace fine insécable sont acceptés. Les virgules, points, signes, groupes irréguliers et texte sont invalides. Zéro explicite reste connu ; vide reste manquant. En cas de somme dépassant Number.MAX_SAFE_INTEGER, aucun indicateur de clics agrégé n’est exposé comme fiable. Les URL hors inventaire n’ajoutent ni poids ni dénominateur.

Un CSV Pages de Search Console peut être partiel ; les données sont généralement attribuées aux canoniques. L’outil ne peut retrouver les URL omises par l’export, ni savoir si un zéro a été produit par un export à partir d’une valeur indisponible. Période, propriété, filtres et source sont des métadonnées facultatives déclarées par l’utilisateur.

## Décisions

| Valeur | Exigence |
|---|---|
| keep | Destination vide ou même clé source ; statut vide ou 200. |
| redirect | Destination HTTP(S) valide obligatoire ; statut vide ou 301/302/303/307/308. |
| consolidate | Mêmes exigences que redirect ; regroupement explicitement choisi. |
| remove | Aucune destination ; statut vide ou 404/410. |
| undecided | Aucune décision exploitable ; une destination candidate peut être conservée. |

302/303/307 déclenchent une revue, sans les requalifier en statut permanent. Les statuts sont **prévus**, jamais observés. Une justification de remove/consolidate manquante est un point de revue, pas une omission automatique. La casse et les espaces autour du libellé décision sont tolérés, l’original reste intact.

Sans décision, une destination différente de la source produit redirect avec origine inferred. Source = destination est ambiguous, jamais keep inféré. Sans destination et sans décision : undecided, jamais remove. Un redirect explicite vers soi-même est une auto-redirection et une boucle ; il compte comme décision renseignée.

## Rapprochement des URL

La clé est construite par un parseur conservateur ; l’API URL sert à valider l’autorité, pas à sérialiser les chemins importés.

1. Retrait des espaces extérieurs signalé ; contrôles, espaces internes et antislash refusés. Encodage percent incomplet et caractères URI non échappés `< > " \` { } | ^` refusés.
2. HTTP(S) seulement. Identifiants intégrés refusés. Hôtes Unicode ou encodés, IPv4 abrégées et autorités dont la sérialisation modifie l’hôte refusés comme ambigus ; demander une forme ASCII explicite. IPv6 déjà canonique accepté.
3. Schéma/hôte minuscules, port décimal canonique et retrait 80 pour HTTP / 443 pour HTTPS. Chemin vide devient `/`. Chiffres hexadécimaux des triplets percent mis en majuscules. Aucun caractère réservé décodé.
4. Fragment retiré de la clé HTTP et conservé séparément, y compris présence d’un fragment vide signalée. Aucun test de navigation vers ce fragment.
5. Chemin, casse, slash final, query, ordre/répétition/valeurs de paramètres et présence d’un `?` vide sont préservés. Unicode dans le chemin/query conservé avec avertissement, sans normalisation NFC ni fusion avec les octets encodés. Segments point d’une URL absolue conservés avec revue ; ils peuvent être traités différemment par un navigateur.
6. Référence relative : base source pour plan/inventaire, base destination pour target. Une base HTTP(S) explicite est obligatoire, jamais l’origine GitHub Pages. Résolution des segments `.` et `..` des références relatives selon la mécanique RFC ; les segments percent restent conservés. Les URL réseau `//hôte/` exigent aussi une base explicite. La prévisualisation expose les trois premiers rapprochements.

Ces choix privilégient les faux négatifs examinables aux fusions non prouvées. HTTP/HTTPS, www/domaine nu, casse, slash final et encodages Unicode restent distincts. Les candidats ne testent qu’un changement simple de schéma, www ou slash final via un index, sans comparaison toutes paires et sans changement des indicateurs.

## Doublons, conflits et graphe

Les occurrences d’une même source sont groupées. Signature de décision : décision interprétée, clé destination (ou original invalide), statut prévu et complétude. Des lignes identiques ou équivalentes partagent une seule arête et produisent PLAN_DUPLICATE. Les justifications et valeurs originales restent présentes à l’export. Des signatures différentes produisent PLAN_CONFLICT, même si une branche paraîtrait préférable.

Le graphe contient exclusivement les sources redirect/consolidate uniques et complètes, avec une arête maximum. Exploration itérative avec mémoïsation : cycles, distance vers un groupe et nombre exact de sauts finis. Une source conflictuelle ou incomplète interrompt la résolution, ainsi que ses prédécesseurs ; aucun terminal arbitraire. Les cycles n’ont pas de nombre fini de sauts. Une destination externe au plan est terminale dans le graphe uniquement, avec HTTP inconnu. Une destination keep est légitime. Une destination remove produit TARGET_REMOVED ; aucun 404 réel n’est affirmé.

Les preuves présentent au plus 12 URL par chemin et 20 références de lignes par groupe, avec identifiant du groupe et compte réel des lignes/sauts. Chaque ligne du plan est conservée et porte ses propres références de constats exportées. Calcul linéaire en nœuds/arêtes hors tris des vues, chaînes longues sans récursion.

Concentration immédiate et terminale calculable sont deux vues distinctes ; elles peuvent signaler les mêmes sources. Seuil fixe annoncé : 5 sources uniques. Clics des sources ayant une correspondance d’inventaire unique et valide seulement, nombre de poids inconnus précisé. Racine d’un hôte / accueil déclaré indiqués factuellement. La présence d’une justification ne prouve pas la pertinence du regroupement.

## CSV et exports

Papa Parse 5.5.3, tableaux de cellules et en-tête séparé (aucune conversion objet qui écraserait des homonymes). UTF-8 décodé avec TextDecoder fatal, BOM admis. Détection virgule/point-virgule/tabulation, correction manuelle et aperçu. Un inventaire à une seule colonne reste valide malgré l’impossibilité de deviner un séparateur absent. Les lignes vides internes restent des enregistrements à corriger ; seule la ligne vide finale générée par le retour de fin de fichier est ignorée. Les numéros sont ceux des **enregistrements CSV**, en-tête = 1, pas ceux des lignes physiques d’un champ multiligne.

`plan-annote.csv` conserve toutes les cellules et lignes, y compris conflits. `urls-a-resoudre.csv` conserve les colonnes originales de toutes les URL sans décision exploitable, y compris import invalide. Les colonnes additionnelles ont un préfixe edikka_ et un suffixe si collision. Les cellules supplémentaires d’un enregistrement mal formé sont conservées sous des en-têtes techniques supplémentaires.

UTF-8 BOM, CRLF, toutes les cellules entre guillemets, guillemets doublés, point-virgule par défaut ou virgule. Chaque cellule, en-tête compris, est neutralisée par une apostrophe si elle débute par = + - @ après contrôles/espaces initiaux, ou commence par un caractère de contrôle C0/C1. La source en mémoire reste intacte. Le nombre de cellules modifiées est annoncé ; la colonne neutralized_columns donne leurs positions dans chaque ligne. Les en-têtes neutralisés sont reconnaissables à leur apostrophe. Cette représentation de sécurité peut devoir être retirée par un utilisateur averti pour un usage autre qu’un tableur ; aucun CSV ne peut garantir le comportement de tout logiciel de tableur et de toutes ses options d’import.

Manifeste JSON facultatif : versions application/méthode, date d’export, métadonnées déclarées, réglages, noms de fichiers et dénominateurs ; pas de lignes. Les exports sont globaux, indépendants de la page et des filtres affichés.

## Codes et preuves

La référence exhaustive machine-readable est `src/codes.ts`. Elle génère la table de codes dans le HTML initial. Un constat possède ID déterministe, code stable, niveau error/review/info, catégorie, lignes concernées, preuve, limite et action. Les IDs dépendent de l’ordre des lignes ; les codes sont versionnés.

Groupes : import (CSV_ERROR, SOURCE_INVALID, TARGET_INVALID, INVENTORY_INVALID, INVENTORY_DUPLICATE, PLAN_DUPLICATE, CLICKS_*), décision (DECISION_*, TARGET_MISSING/INCOMPATIBLE, STATUS_INCOMPATIBLE, TEMPORARY_STATUS, REASON_MISSING, PLAN_CONFLICT), parcours (SELF_REDIRECT, GRAPH_*, TARGET_REDIRECTED/REMOVED, CONCENTRATION_*), couverture (INVENTORY_UNRESOLVED, PLAN_OUTSIDE, MATCH_CANDIDATE), transformations (URL_*).

## Sources primaires consultées le 3 octobre 2026

- [Google — site moves](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes) : inventaire et mapping, destinations pertinentes, redirections et tests distincts.
- [Search Console — rapport](https://support.google.com/webmasters/answer/7576553?hl=fr), [limites des tables](https://support.google.com/webmasters/answer/17010575), [dimension Pages et canoniques](https://support.google.com/webmasters/answer/17011259) : la couverture importée ne représente pas nécessairement tout le site.
- [Screaming Frog — comparaison / URL Mapping](https://www.screamingfrog.co.uk/seo-spider/tutorials/how-to-compare-crawls/) : fonctionnalités préexistantes. Page consultée ; copie locale complète refusée HTTP 403, limite conservée dans la recette.
- [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986) : syntaxe, résolution, normalisation. La politique conservatrice ci-dessus est un choix méthodologique, pas une obligation SEO issue de la RFC.
- [Papa Parse](https://www.papaparse.com/docs) et [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) : parsing et publication statique.

L’outil ne remplace pas un crawl, une recette HTTP, une revue de pertinence ni le suivi après migration. Aucun score de risque, perte prévue, promesse de classement ou validation SEO exhaustive.
