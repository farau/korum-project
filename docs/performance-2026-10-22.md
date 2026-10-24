# LCP mobile et refonte SQL/live — 22 octobre 2026

Les deux changements sont implémentés et testés localement. Aucune migration distante ni publication n’a été effectuée. La migration 0016 doit précéder la mise en service du nouveau lecteur SQL.

## Explore mobile

Le CSS sélectionne des dérivés WebP pour les écrans de 600 px ou moins. Le cadrage reproduit le fond existant, centré sur une zone de 600 × 680 px ; des fichiers de 1 200 × 1 360 px servent les écrans de haute densité. Les originaux desktop sont conservés. La compression finale utilise une qualité de 90 pour le dérivé 1x et 85 pour le 2x afin de conserver la texture du fond.

| Thème | Original | Mobile 1x | Mobile 2x |
| --- | ---: | ---: | ---: |
| Sombre | 752 186 octets | 10 050 octets (−98,7 %) | 38 214 octets (−94,9 %) |
| Clair | 1 385 118 octets | 26 358 octets (−98,1 %) | 116 598 octets (−91,6 %) |

Le thème sauvegardé est appliqué par un script constant exécuté pendant l’analyse du HTML, avant le rendu des fonds. Le contrôle navigateur a révélé puis vérifié la suppression du téléchargement initial du fond sombre pour un visiteur ayant choisi le thème clair. Les onze scénarios de contrôle téléchargent chacun un seul fond, avec la bonne densité ; aucune erreur JavaScript ni largeur débordante détectée. Le changement ne modifie pas le choix de thème de l’utilisateur.

La comparaison utilise Chrome headless, le build Webpack de production local, une base synthétique et Redis local. Viewport 390 × 844, CPU ×4, latence configurée 150 ms, débit descendant 1,6 Mbit/s, montant 750 kbit/s, cache HTTP désactivé et contexte neuf par visite. Le serveur est préchauffé. Les scénarios « avant » forcent uniquement le fond original dans le même build ; ils isolent ce changement et ne reproduisent pas l’ancien déploiement entier. Les trois comparaisons finales sont exécutées après les benchmarks SQL, sans générateur de charge concurrent. Les autres scénarios servent au contrôle des variantes et du rendu.

| Explore sombre, mobile 1x | Trois passages | Médiane |
| --- | --- | ---: |
| Fond original | 9,808 / 9,816 / 9,824 s | **9,816 s** |
| Fond mobile final | 1,648 / 1,680 / 1,652 s | **1,652 s** |

[Mesures finales avant/après](performance-2026-10-22/browser-timing.json). Les octets transférés incluent les en-têtes HTTP et diffèrent légèrement des tailles de fichiers ci-dessus.

Le contrôle complémentaire du thème clair à densité 2 donne un LCP de **3,548 s** dans ce protocole : le gain ne signifie pas que tous les appareils et thèmes passent sous 2,5 s. Les ressources JavaScript et les autres chargements restent des pistes d’amélioration. Aucun LCP de terrain, INP ou résultat du déploiement distant n’est revendiqué.

Preuves : [tailles des fichiers](performance-2026-10-22/artwork-sizes.json), [contrôles des variantes](performance-2026-10-22/browser-variants.json), [rendu sombre](performance-2026-10-22/explore-dark-mobile.png), [rendu clair](performance-2026-10-22/explore-light-mobile.png). Les montants et wallets affichés sont synthétiques.

Régénération des fichiers : `node scripts/optimize-explore-backgrounds.mjs`. Le script `scripts/check-explore-performance.mjs` accepte `KORUM_PERF_ORIGIN` (serveur local uniquement), `KORUM_PLAYWRIGHT_MODULE` (installation externe de Playwright), `KORUM_CHROME_PATH` et `KORUM_PERF_OUTPUT`. `KORUM_PERF_TIMING_ONLY=1` sélectionne les trois paires avant/après ; sans cette option, les thèmes, densités et variantes desktop sont aussi contrôlés. Playwright n’a pas été ajouté aux dépendances applicatives.

## SQL et mises à jour live

La migration [0016](../db/migrations/0016_create_market_snapshot_aggregates.sql) crée deux projections dans `indexer_v2` :

- `camp_trader_memberships` conserve le nombre de trades par chaîne, token et wallet. Un trader ayant fermé sa position reste compté ; l’adresse nulle est exclue. Le compteur Versus déduplique les wallets qui ont utilisé les deux camps.
- `camp_trade_buckets` maintient volume, nombre de trades et dernier prix par horodatage exact. Plusieurs trades du même bloc partagent un bucket. Les corrections ou suppressions ajustent les agrégats et, si nécessaire, retrouvent le prix de clôture avec une recherche indexée. Les horodatages fractionnaires restent exacts : aucun arrondi à la minute.

Le trigger travaille dans la transaction de `camp_trades`. Un rollback annule aussi les agrégats ; un upsert rejoué avec les mêmes valeurs ne les incrémente pas. Les projections ne dépendent pas de l’ordre d’arrivée des métadonnées des camps. L’index `(chain_id, token_address, traded_at DESC, block_number DESC, log_index DESC)` couvre les prix ; il remplace l’ancien index dont il reprend le préfixe.

Le lecteur ne sérialise plus les trades bruts de 24 heures. Il charge les buckets, leurs cumuls de volumes/comptages, un prix d’ancrage. Les sparklines sont désormais calculées depuis ces mêmes buckets, sans charger les 96 derniers trades bruts. Les cumuls utilisent des chaînes d’entiers et `BigInt` pour les volumes. Les fenêtres de 5 min, 1 h, 6 h et 24 h sont retrouvées par recherche dichotomique ; les volumes et nombres de trades résultent de différences de cumuls. Le passage du temps continue donc à être traité depuis Redis, sans lecture SQL périodique supplémentaire. Le champ public `priceHistory` contient désormais 96 prix chronologiques, espacés de 900 secondes, avec `null` pour les périodes inconnues. Ces positions sont conservées dans le SVG, sans compression de l’axe temporel.

Les notices live continuent à actualiser uniquement les snapshots chauds affectés, sous les protections CAS existantes. La rétention inactive de 600 secondes, les verrous de reconstruction partagés, la réconciliation des métadonnées et le polling de secours du profil uniquement sans SSE restent inchangés. Les clés internes `debate-catalog-v3` / `debate-row-v3` et `valuation-fallback-v2` isolent le nouveau format.

## Mesures PostgreSQL et limites

Le test utilise PostgreSQL 15 local, l’ensemble des migrations réelles, puis 20 000 trades synthétiques concentrés sur 100 horodatages. Des corrections déplacent ensuite certains trades de 125 ms et des suppressions retirent des lignes. Le premier relevé, avant adaptation des sparklines à la demande de l’utilisateur, comprend 111 buckets pour le camp principal, plus les 96 derniers trades. Les chiffres historiques ci-dessous décrivent cette version ; le complément en fin de document décrit la suppression de cette lecture brute. Les comparaisons de valeurs utilisent les données brutes en base, pas un mock du lecteur.

| Mesure locale | Résultat |
| --- | ---: |
| Ancienne fenêtre brute du token A, JSON compact | 2 119 917 octets |
| Nouveaux buckets + 96 points, même sérialisation JSON | 15 942 octets |
| Réduction sur ces champs du snapshot | 99,25 % |
| Lecture applicative complète d’un Versus, `EXPLAIN ANALYZE` | 16,917 ms |
| Ancienne agrégation brute 24 h d’un seul token, comparateur partiel | 43,517 ms |

Les deux durées SQL portent sur des périmètres différents : elles ne constituent pas un ratio avant/après de la route complète. Les tailles portent uniquement sur la fenêtre d’un token, pas sur toute la réponse HTTP ni tout Redis.

Deux mesures de lots de 500 insertions donnent 278,6 ms en moyenne avec les triggers préexistants, contre 286,9 ms avec les nouveaux agrégats, soit environ +3,0 %. L’ordre des essais est inversé au second passage ; toutes ces transactions sont annulées. Les index sont identiques entre les deux variantes : ce test isole le coût du nouveau trigger. Deux passages restent insuffisants pour établir un percentile ou un surcoût universel. L’insertion des 20 000 trades dans une seule transaction dure 24,42 s ; ce lot extrême concentre les écritures sur un wallet et ne simule pas la cadence réelle des webhooks.

Le scénario est volontairement dense : il démontre l’élimination de la répétition des trades à un même horodatage, pas un facteur universel. Si tous les trades ont des horodatages différents, le nombre de buckets augmente ; avec les timestamps blockchain à la seconde, une fenêtre de 24 heures contient au plus 86 401 horodatages. Les traders distincts, les positions, les statistiques de créateurs et la sérialisation du catalogue conservent un coût dépendant de leur taille. Les regroupements historiques restent stockés en SQL pour permettre corrections et ancrages de prix. A02, concernant un webhook manquant avant la mise à jour du cache, n’est pas résolu par ce chantier.

Les plans complets `EXPLAIN (ANALYZE, BUFFERS)` et mesures d’écriture sont dans [la preuve PostgreSQL](performance-2026-10-22/postgres-synthetic.json). Il faut encore mesurer une distribution comportant davantage de tokens, de wallets et d’horodatages sur le matériel cible. Aucune extrapolation de débit de production n’est faite.

## Validation et mise en service

Réussites : TypeScript strict, lint, build Webpack de production ; tests des prix/fenêtres, caches Debate et charts avec Redis réel, PNL Profile avec Redis, live Profile, charts live, marchés gradués, Analytics, sessions wallet et watchlist. Le nouveau test PostgreSQL couvre backfill, rejeux, ordre d’arrivée, correction de montant/prix/wallet/token/horodatage, suppression du dernier trade, corrections multi-lignes, écritures concurrentes de wallets distincts, rollback, isolation des chaînes, grands entiers et bords exacts des fenêtres. La suite n’utilise aucun wallet ni base distante.

Pour reproduire le test SQL : `KORUM_TEST_DATABASE_URL=postgres://<utilisateur>@127.0.0.1:<port>/postgres node scripts/check-market-snapshot-aggregates.mjs`. Le rôle doit pouvoir créer une base ; le script crée une base dédiée et la supprime à la fin. `KORUM_TEST_PROOF` choisit le fichier de mesures. `KORUM_TEST_KEEP_DATABASE=1` permet de conserver explicitement les données synthétiques pour un test navigateur. Ne pas confondre ce script avec `npm run db:migrate`, qui applique les migrations à la base configurée.

Ordre de mise en service à prévoir :

1. Appliquer la migration 0016 avant le nouveau code. Son backfill prend un verrou qui bloque les écritures de `camp_trades`, tout en permettant les lectures ; prévoir cette interruption selon la volumétrie et le mécanisme de retry du sink.
2. Basculer les lecteurs et les publishers de webhooks de façon coordonnée. Éviter une coexistence prolongée des anciens publishers et des nouveaux lecteurs : les anciennes versions ne mettent pas à jour les clés v3.
3. Vérifier la livraison des événements, le coût d’écriture et les latences sur le déploiement cible. Les anciennes clés ne sont pas supprimées en masse ; leur rétention inactive les évacue.

Le script de migration existant exécute chaque fichier dans une transaction. Une migration échouée revient donc à l’état précédent. Pour revenir à l’ancien code après une migration réussie, les tables originales restent disponibles et le nouvel index couvre les anciennes recherches ; il faut toutefois éviter de réutiliser des snapshots de l’ancienne version devenus périmés pendant la bascule. Lors de ces mesures initiales, aucun rollback ou déploiement distant n’avait été exécuté ; l’application distante de 0016 est documentée ci-dessous.

## Complément — sparklines à intervalles fixes

Le comportement « 96 derniers trades » est remplacé par **96 fins d’intervalle de 15 minutes sur une fenêtre de 24 heures** : le premier échantillon est à maintenant −23 h 45 et le dernier à maintenant. Chaque point prend le dernier prix connu à sa date, jamais un prix futur.

- Activité faible : le dernier prix connu est reporté aux fins d’intervalle suivantes.
- Aucun trade pendant les dernières 24 heures, mais prix antérieur connu : ligne horizontale à ce prix.
- Aucun trade jamais enregistré : 96 positions inconnues et affichage « — », sans faux prix nul.
- Token récent : positions avant sa création laissées vides ; avant son premier prix connu, les positions restent également vides.
- Premier trade dans les quinze dernières minutes : un seul point à droite, sans étirer cette activité sur toute la largeur.

L’en-tête indique « Graph 24h ». Un point isolé est représenté par un point, une série constante par une ligne horizontale centrée ; les espaces inconnus ne sont pas reliés. Le graphique principal Versus n’est pas modifié. Les fenêtres de volume et les variations continuent d’utiliser tous les agrégats concernés.

La lecture SQL des 96 trades bruts a été retirée. Les points sont calculés depuis le snapshot Redis existant, sans nouveau polling ni migration supplémentaire. Les caches de DTO de secours passent de `price-windows-v1` à `price-windows-v2` afin d’éviter de servir temporairement l’ancienne sémantique.

Vérifications : scénarios sans trades, prix ancien, données rares, 200 trades en dix minutes, création récente, horodatages futurs, limites exactes de 15 minutes, conservation des trous dans le DTO et tests SVG. La suite PostgreSQL compare aussi les 96 points à des recherches indépendantes dans les trades bruts.

Validation du complément réussie : comparaison PostgreSQL sur 20 000 trades, tests Redis Debate/Profile, tests des fenêtres et du rendu SVG, marchés gradués, TypeScript, lint et build Webpack. [Preuve PostgreSQL du format final](performance-2026-10-22/postgres-fixed-sparkline.json) : 96 points calculés à partir de 111 buckets, sans tableau séparé des derniers trades. Les timings de ce relevé servent de diagnostic local, sans comparaison isolée de performance.

## Application de la migration 0016 — 22 octobre 2026

Migration appliquée à la connexion `DATABASE_URL` utilisée par l’application locale, base Railway testnet (chaîne 46630). Les checksums des migrations 0001 à 0015 ont été vérifiés avant exécution ; seul 0016 était en attente. Exécution par le runner transactionnel existant, sans modification de données métier ni suppression de trades.

Contrôles en lecture seule après commit : 64 trades, 17 participations wallet/token et 64 buckets ; égalité exacte des comptages, volumes et prix de clôture avec l’historique brut, trigger actif, index couvrant présent et index remplacé absent. Le lecteur SQL applicatif charge les 6 Versus. [Preuve enregistrée](performance-2026-10-22/migration-0016-remote.json).

Aucune publication du nouveau code applicatif : les gains LCP et SQL restent des mesures locales. La migration 0017 ajoutée ensuite pour les nonces d’authentification a également été appliquée à cette base distante, à la demande de l’utilisateur ; voir ci-dessous.

## Application de la migration 0017 — 22 octobre 2026

Après vérification des checksums des 16 migrations précédentes, le runner transactionnel a appliqué `0017_create_consumed_wallet_nonces.sql` à la même base testnet utilisée par l’application. Contrôles en lecture seule après commit : checksum enregistré conforme, colonnes `nonce_hash` et `expires_at` non nulles, clé primaire unique sur le hash et index d’expiration valides. La table était vide lors du contrôle ; aucun nonce ou utilisateur synthétique n’a été inséré dans cette base distante. [Preuve enregistrée](performance-2026-10-22/migration-0017-remote.json).

La base est prête pour le nouveau code d’authentification local. Aucun code applicatif n’a été déployé sur Railway ; l’ancienne version hébergée ne consomme pas encore ces nonces.
