# Publication GitHub Pages

Dépôt public : [edikkaweb/seo-migration-review-demo](https://github.com/edikkaweb/seo-migration-review-demo). Publication autorisée par Bertrand Morel le 3 octobre 2026.

1. Dans les paramètres du dépôt, Pages → Source : GitHub Actions.
2. Depuis ce dossier : `npm ci` puis `npm run verify`. Relire le diff ; ne transférer aucun CSV utilisateur, secret, node_modules, fichier du cockpit ou archive tierce.
3. Pousser le commit sur main. Les pull requests exécutent les contrôles sans droit de publication.
4. Observer les deux jobs verify puis deploy : la réussite de verify seule ne prouve pas la publication.
5. Vérifier [la démonstration](https://edikkaweb.github.io/seo-migration-review-demo/), les ressources du build-manifest et leurs empreintes ; rejouer la recette avec TEST_URL.

Les sources, la documentation et les tests sont publics ; seuls les fichiers de dist sont servis. L’intégration Edikka appartient à un lot séparé et borné, enregistré dans l’action locale 575.

Le job deploy dépend de verify et dispose seulement de contents:read, pages:write et id-token:write. Actions : configure-pages v5, upload-pages-artifact v4, deploy-pages v4. Les résultats de recette navigateur sont conservés comme artefact de workflow même en cas d’échec.

Retour arrière : republier un commit précédemment vérifié. Ne pas réécrire l’historique pour cacher un échec.
