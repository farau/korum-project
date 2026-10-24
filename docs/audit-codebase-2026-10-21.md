# Audit de codebase — 21 octobre 2026

Révision examinée initialement : `e0b50c0`, avec la modification locale préexistante de `app/components/explore/ExploreVsCard.tsx`, préservée. L'audit et les mesures ci-dessous décrivent cet état initial. Un premier lot de corrections locales a ensuite été réalisé à la demande de l'utilisateur ; son statut figure ci-dessous. Il n'a pas été déployé.

**Verdict : la compilation est propre, mais plusieurs appels inutiles, défauts de cohérence, risques de saturation et dépendances signalées vulnérables sont présents.** Le cache et le live ont une architecture sérieuse ; ils ne suffisent pas à neutraliser les problèmes décrits ci-dessous.

P1 = à traiter en priorité ; P2 = correction planifiée ; P3 = nettoyage. Une reproduction isolée valide le comportement du code, sans constituer une mesure de latence en production.

## Premier lot de corrections locales — 21 octobre 2026

| Constat | État local et changement |
| --- | --- |
| A00 — dépendances | Next/ESLint 16.4.2, Sharp 0.35.5, Axios 1.20.0 ; transitives compatibles actualisées. Audit npm de production : **0 vulnérabilité signalée**. Audit complet : **5 entrées élevées**, toutes dans la chaîne de développement `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`. Pas de rétrogradation incohérente vers Next/ESLint 14. |
| A01 / A04 — watchlist | Provider partagé par wallet et déploiement, une lecture des IDs pour les cartes ; objets Debate chargés seulement dans les vues Watchlist. Une souscription BroadcastChannel par session. Annulation des lectures, rejet des requêtes dont le wallet attendu diffère du cookie, file de mutations et rollback isolés. Une erreur de rafraîchissement conserve les données précédentes et apparaît dans les vues Watchlist. |
| A02 — fraîcheur | **Ouvert** : retrait, à la demande de l’utilisateur, de la limite d’âge de 60 secondes et du polling Profile lorsque SSE est connecté. Conservation du cache piloté par événements et de sa rétention inactive de 600 secondes ; le polling de secours préexistant du profil reste limité à l’absence de SSE. |
| A03 — coût des lectures | Une lecture ciblée sur un seul Versus à cache froid ne construit plus le catalogue de 250 éléments ; les consommateurs multiples gardent la lecture groupée. **Complément du 22 octobre :** agrégats SQL et snapshots refondus, testés localement sur 20 000 trades ; voir le deuxième lot ci-dessous. Migration 0016 appliquée à la base testnet le 22 octobre ; agrégats et requête SQL applicative vérifiés. Le nouveau code reste local. |
| A05 — visite anonyme | Présence du cookie transmise par le layout ; aucun DELETE de session ni `router.refresh()` au montage anonyme sans cookie. Le nettoyage d'un cookie restauré reste actif. |
| A13 — tests existants | Mocks manquants et données de fixture réparés dans les trois scripts en échec ; assertions fonctionnelles conservées. |

La stratégie Redis existante est conservée : aucune reconstruction SQL supplémentaire déclenchée par l’âge des snapshots. Les invalidations événementielles, verrous de reconstruction partagés et la réconciliation préexistante des métadonnées restent actifs. À l’issue de ce premier lot, A02 nécessitait encore une solution ciblée et mutualisée de détection des événements manquants, sans ajouter une recharge SQL périodique par wallet ; le quatrième lot ci-dessous l’implémente localement.

Validation du lot avant ce retrait : génération des types Next, TypeScript strict, lint, build Webpack de production et **19 scripts de vérification** réussis. Les tests Redis utilisent une instance locale temporaire sans persistance ; SQL/RPC sont simulés dans les tests de concurrence. Le script des contrats v2 a également réussi en lecture seule sur le testnet après un premier échec DNS du sandbox, sans transaction envoyée.

Validation après retrait : TypeScript strict, lint et quatre scripts réussis (`check-debate-cache`, `check-market-chart-cache`, `check-profile-pnl --redis`, `check-profile-live`). Redis local temporaire, SQL simulé : réutilisation des caches sans limite d’âge, invalidations ciblées et reconstruction partagée vérifiées ; 100 lecteurs sur 4 réplicas partagent un chargement SQL du même snapshot. Le build et les autres scripts du lot précédent n’ont pas été relancés pour ce retrait.

Vérification navigateur supplémentaire avec les vrais composants React et TanStack Query, API/wallet simulés : **12 cartes → 1 GET des IDs**, en montage normal et StrictMode ; détails chargés séparément ; mutation de A terminant après passage à B sans modifier les IDs de B ni publier une notification pour l'ancienne session. Ce test ne remplace pas un parcours avec une extension wallet réelle.

Les audits npm ont été recalculés : le relevé juste avant correction comportait 15 entrées (1 critique, 12 élevées, 2 modérées), contre 14 lors du relevé initial. Les avis évoluent ; les nombres historiques plus bas sont conservés comme preuves de l'audit initial.

**État actuel — vérification finale du 25 octobre 2026 :** les six lots de corrections locales sont vérifiés, mais **A00 est rouvert** : le nouvel audit npm signale 17 entrées élevées liées à Zod, y compris en production. Le bilan dépendances ne permet plus de conclure « zéro vulnérabilité ». Le dernier lot traite Analytics, la projection Leaderboard A12, le ciblage Profile, le chargement wallet public A14 et le nettoyage/CI décrit ci-dessous. Les migrations 0016 à 0019 ont déjà été appliquées au testnet ; le code applicatif reste local. Restent le déploiement coordonné, les parcours avec un wallet réel et les mesures après déploiement (RUM, SQL, Redis, journal de livraison). Les mesures Railway et LCP historiques concernent le déploiement initial ; aucun gain en production n'est encore établi.

## Deuxième lot local — LCP mobile et SQL/live — 22 octobre 2026

**A15 :** variantes mobiles WebP aux densités 1x/2x pour les thèmes sombre et clair, cadrage conservé, et initialisation du thème dès la lecture du HTML pour éviter le téléchargement initial du mauvais fond. Fonds desktop conservés. Contrôles Chrome sur le build de production local, PostgreSQL synthétique et Redis local ; aucun déploiement.

**A03 :** migration `0016_create_market_snapshot_aggregates.sql` et lecteur applicatif refondus. Les participations par wallet/token et les volumes/comptages par horodatage exact sont maintenus transactionnellement à l’insertion, correction et suppression des trades. Les snapshots transportent des cumuls compacts ; les fenêtres glissent par recherche dichotomique, sans recalculer tous les trades à chaque GET. Les sparklines utilisent 96 fins d’intervalle de 15 minutes, calculées depuis les buckets, sans lecture supplémentaire des trades bruts. Les périodes inconnues gardent leur place sur l’axe temporel ; les périodes inactives conservent le dernier prix connu. L’index temporel existant est remplacé par un index couvrant, sans doublon. Les clés internes de snapshot passent en v3 pour isoler les formats.

La stratégie Redis reste événementielle : rétention inactive de 600 secondes, invalidations et verrous partagés conservés. Aucun nouveau polling SQL par utilisateur. A02 reste ouvert. Les comptages de participants distincts, les positions et la sérialisation du catalogue ont encore un coût dépendant de leur taille ; le test synthétique ne certifie pas toutes les distributions d’activité.

**Mise en service :** la migration 0016 a été appliquée le 22 octobre à la base Railway testnet utilisée par `.env.local`. Restent la bascule coordonnée des lecteurs et publishers live et les mesures du nouveau code hébergé. Le remplissage initial verrouille les écritures de `camp_trades` dans une transaction.

Mesures, limites, procédures de reproduction et preuves : [rapport des deux chantiers](performance-2026-10-22.md).

## Migration distante et troisième lot local — 22 octobre 2026

**0016 appliquée** à la base configurée par l’application (`DATABASE_URL`, chaîne 46630), après contrôle des checksums des 15 migrations précédentes. Le script existant a enregistré la migration dans une transaction. Vérification en lecture seule, sur un snapshot cohérent : **64 trades, 17 participations wallet/token, 64 buckets, 6 Versus**. Comptages, volumes et prix de clôture concordent exactement avec les trades bruts ; trigger actif, nouvel index présent et ancien index retiré. La requête SQL réelle de `loadIndexedDebateRowsByIds` fonctionne pour les 6 Versus. [Preuve](performance-2026-10-22/migration-0016-remote.json). Ce contrôle du lecteur ne constitue pas un test navigateur ni une mesure de latence de production.

L’utilisateur a demandé de poursuivre les corrections **en local**. Aucun code applicatif n’a été publié sur Railway dans ce lot.

| Constat | Correction locale et limite |
| --- | --- |
| A07 — lectures Holdings | Query partagée par wallet et déploiement, chargement initial conservé pour Overview, changements d’onglet sans nouvelle lecture ; polling de deux minutes limité à Holdings visible. Vérification du wallet attendu côté API et du wallet retourné côté client. Les lectures RPC de soldes elles-mêmes restent inchangées. |
| A09 — pagination Explore | Clé React indépendante des IDs/classements ; la page reste sélectionnée lors des mises à jour live. Une diminution du nombre de résultats borne la page ; filtres et tri volontaires réinitialisent toujours la navigation. A10, sur la limite des 100 Versus, reste ouvert. |
| A11 — signatures rejouables | Consommation durable du nonce et écriture utilisateur dans une même transaction PostgreSQL, avec clé unique ; un échec annule les deux opérations. Nettoyage opportuniste borné des nonces expirés, sans timer. Limites avant RPC : 60 tentatives/minute/IP, 10/challenge/5 minutes, corps streamé de 48 KiB, message de 4 096 caractères, signature hexadécimale de 16 KiB maximum. Le chemin contract-wallet reste disponible. **Migration 0017 appliquée à cette même base testnet le 22 octobre, à la demande de l’utilisateur : checksum, colonnes, clé primaire et index d’expiration vérifiés après commit.** [Preuve](performance-2026-10-22/migration-0017-remote.json). Le nouveau code d’authentification reste local ; la migration seule n’active pas la protection sur l’ancienne application hébergée. |
| A12 — recherche Leaderboard | Budget de 30 recherches/minute/IP et cache serveur de 30 secondes des résultats par recherche/page/tri, clé de recherche hashée. Le filtre reste après le calcul du rang global. **Partiel** : des recherches distinctes recalculent encore le classement ; aucune projection globale mutualisée n’a été ajoutée. Le rate limiter existant reste local par instance en absence de Redis. |
| Redis dégradé | `rememberJson` mutualise les lectures simultanées même quand la révision Redis est inaccessible, sans écrire de cache non versionné. **Partiel** : les autres erreurs possibles des snapshots maintenus ne sont pas toutes couvertes. |
| Prévisualisation de création | Deux quantités initiales identiques partagent la même promesse de quote ; les quantités distinctes restent calculées en parallèle. La vérification avant transaction est conservée. |

Validation : `check-audit-followup` (vrais observers TanStack, pagination, 100 lectures coalescées, reprise Redis et rang global), `check-auth-replay` (vrai PostgreSQL local, vraies signatures EOA, 8 vérifications concurrentes → 1 session, rollback/retry, expiration, signatures contractuelles et limites de corps), tests Profile PNL/live, creator-fee, isolation wallet et création d’images. TypeScript, lint et build Webpack réussis. Les appels SQL/RPC externes sont simulés dans les tests de composants ; la base de test d’authentification est créée puis supprimée sur localhost.

À l’issue du troisième lot restaient notamment A02, A06, A08, A10, A14 et une partie des nettoyages P3. Le complément suivant traite les trois premiers ; il ne clôt pas l’audit.

## Quatrième lot local — uploads, cadence live et récupération — 22 octobre 2026

**Migrations 0018 et 0019 appliquées à la base Railway testnet le 22 octobre, à la demande de l’utilisateur**, après validation des checksums des 17 migrations précédentes. Application par le runner transactionnel du dépôt, avec attente de verrou limitée à 5 secondes et durée de requête limitée à 60 secondes. Contrôle après commit : checksums concordants, neuf colonnes non nulles, cinq index valides dont deux clés primaires, deux fonctions et trigger actifs. Le journal contient 12 entrées initiales couvrant les 12 camps ; aucune réservation d’upload, 64 trades toujours présents. [Preuve de vérification](performance-2026-10-22/migrations-0018-0019-remote.json). Aucun déploiement applicatif ni changement Goldsky : le journal SQL est actif, mais son acquittement/rattrapage et les nouveaux uploads nécessitent le nouveau code applicatif. Les entrées du journal peuvent s’accumuler jusqu’à sa mise en service.

| Constat | Correction et statut local |
| --- | --- |
| A06 — connexion SQL pendant Pinata | **Corrigé localement.** Réservation SQL courte par hash, upload hors transaction, puis enregistrement et libération dans une seconde transaction courte. Les appels identiques d’une instance partagent une promesse ; une autre instance reçoit HTTP 503 avec `Retry-After: 3`. Lease de 90 secondes pour un timeout Pinata de 30 secondes, propriétaire unique, reprise après expiration et nettoyage opportuniste borné. Le CID n’est retourné qu’après commit. Migration 0018 requise. |
| A08 — rafraîchissements HTTP | **Partiel.** Listes/ticker regroupés sur une seconde, statistiques Profile sur cinq secondes ; détails limités aux tokens concernés. Les réponses lentes des listes ne sont pas annulées à chaque événement. Les chart trades continuent à être fusionnés immédiatement ; récupération des charts et historique des trades conservent leur cadence de 250 ms. La révision globale des caches serveur `market:*`, le feed global Profile et le polling de secours restent à optimiser séparément. |
| A02 — webhook manquant | **Mécanisme implémenté et testé localement.** Journal SQL atomique avec chaque insertion/correction/suppression, acquittement de la version exacte après publication Redis. Le contrôle partagé préexistant d’une minute consulte aussi les événements non acquittés depuis 30 secondes. En cas d’écart, invalidation des charts concernés et des sources maintenues, puis notification SSE de récupération. Migration 0019 requise. |

**Coût et stratégie Redis :** aucun rechargement SQL périodique par utilisateur ni limite d’âge des snapshots. La rétention inactive de 600 secondes et les verrous de reconstruction sont conservés. Le lease Redis élit un seul contrôle par minute pour tous les réplicas/utilisateurs : en fonctionnement normal, la lecture de métadonnées existante plus **une lecture indexée du journal**, vide si tout a été livré. Un timer par processus maintient ce contrôle tant qu’il possède des abonnés SSE, même sans nouvelles requêtes HTTP ; il s’arrête au départ du dernier abonné. Les lectures HTTP de marchés/profils partagent ce même lease. Les tests avec 100 lecteurs sur quatre réplicas valident un seul contrôle SQL, pas 100.

Le journal ajoute néanmoins une écriture SQL par trade modifié, puis une lecture des versions et une suppression conditionnelle par batch webhook publié. Les upserts ne changeant que `ingested_at` ne créent pas de nouvelle version. **Ce coût d’écriture n’a pas été mesuré sur le trafic de production.** Le bénéfice attendu est une récupération sans reconstruire régulièrement les snapshots de chaque wallet.

**Récupération et limites :** le contrôle sélectionne au plus 100 événements anciens, puis invalide une fois les tokens correspondants et acquitte tous les événements visibles entièrement couverts. Un burst de 1 000 événements pour le même token est donc traité en un passage. Un snapshot SQL en isolation repeatable-read protège les commits arrivant pendant l’invalidation ; une correction concurrente fait annuler l’acquittement, qui sera retenté. Un ancien webhook d’insertion après une correction force également une récupération, y compris des anciennes sources Profile. Les charts d’autres tokens restent valables ; les sources maintenues publiques/privées sont invalidées plus largement lors d’un écart avéré pour couvrir les anciens acteurs inconnus.

Avec services disponibles, lecteurs actifs et faible backlog, prévoir environ **30 à 90 secondes** de détection/récupération ; davantage avec des tokens supplémentaires en attente ou des échecs. Sans lecteur ni abonné, le contrôle reprend à la prochaine activité. SQL et Redis ne forment pas une transaction distribuée : la restauration d’un ancien état persistant de Redis après acquittement SQL reste hors garantie. Pour Pinata, un succès externe suivi d’un crash/échec SQL peut laisser un pin orphelin ; la réservation n’est pas une garantie d’upload externe exactement une fois.

**Validation :** build Webpack, TypeScript et lint réussis. `check-market-delivery` utilise de vrais PostgreSQL et Redis locaux : pool SQL limité à une connexion encore disponible pendant Pinata, 20 uploads identiques mutualisés, concurrence inter-instance, expiration/propriétaire remplacé, échec au commit, triggers insert/update/delete, rollback, acquittement ancien, isolation des chaînes, panne Redis, 100 lecteurs/quatre réplicas, burst de 1 000 événements et commits concurrents. `check-market-hub` vérifie 100 abonnés pour un timer, l’absence de chevauchement et son arrêt au dernier départ. `check-profile-live` vérifie les cadences avec de vrais observers TanStack : 40 notifications en une seconde → un rafraîchissement de liste et du détail concerné, aucun du détail sans rapport et aucun HTTP chart quand les fusions suffisent ; une requête lente termine avant son suivi.

Régressions vérifiées : `check-debate-cache` (dont insertion livrée après correction et déduplication), `check-market-chart-cache`, `check-profile-pnl --redis`, `check-graduated-markets`, `check-market-price-changes`, `check-token-images`, `check-auth-replay`, `check-audit-followup` et `check-create-images`. Pinata et RPC simulés ; aucune transaction blockchain ni image réellement envoyée. Les bases et clés Redis des tests sont isolées puis supprimées. Ce lot ne mesure ni LCP/INP de terrain ni charge réelle après déploiement.

## Cinquième lot local — cache, pannes Redis et pagination Explore — 23 octobre 2026

**Code local uniquement, aucune nouvelle migration ni opération distante.** Les migrations 0016 à 0019 restent appliquées comme indiqué précédemment. Le nouveau lecteur, les publishers et le navigateur doivent être déployés ensemble pour bénéficier des changements suivants.

| Point | Résultat |
| --- | --- |
| A08 — invalidations serveur | Les caches courts d’historique/chart et de venue utilisent désormais la révision du token et celle des métadonnées. Un trade sur A conserve le cache de B ; une correction de A et une modification globale de métadonnées invalident toujours les entrées concernées. Les anciennes lectures en cours restent isolées par leur révision. Les endpoints réellement globaux conservent leur révision globale. |
| Pannes Redis | Les lectures de snapshots maintenus récupèrent les erreurs de lecture et de prise du lease dans la même promesse partagée. Un échec d’écriture du cache retourne la lecture SQL fraîche déjà obtenue, sans la refaire ; un échec de libération du lease ne masque pas une réponse réussie. Les erreurs SQL et les conflits prolongés de reconstruction restent visibles. Profile dispose d’une lecture dégradée mutualisée sans réutilisation d’un ancien résultat mémoire quand le live configuré est indisponible. |
| A10 — Explore | Classement et filtres appliqués côté serveur sur tous les Versus indexés complets et représentables par le contrat d’ID actuel. Réponse limitée à 12 objets de liste, avec total et pagination ; aucun catalogue complet transmis au navigateur. Hot Take conserve ses 12 premiers par volume, puis le tri choisi. Le rang est départagé par ID pour stabiliser les égalités. Page conservée au rafraîchissement, bornée si les résultats diminuent, remise à 1 lors d’un changement volontaire de filtre/tri. |
| Coût SQL | Projection de classement compacte et partagée, conservant les cumuls de volumes par horodatage pour faire glisser les 24 heures sans nouvelle lecture à chaque minute. À chaud, un webhook relit les seuls marchés affectés et publie le classement avec les autres mises à jour Redis. Une page froide charge ses 12 détails dans une seule requête, sans initialiser le catalogue de 250 éléments. La requête commune borne les Versus sélectionnés avant de développer les vues de marché et de destinataire. |

**Stratégie conservée :** aucun timer SQL par utilisateur, aucune expiration forcée par âge des snapshots live. TTL d’inactivité de 600 secondes et verrous inter-réplicas conservés. En panne Redis, la déduplication ne peut être garantie qu’à l’intérieur de chaque processus : les réplicas ne disposent plus du verrou partagé. Les lectures dégradées ne constituent pas un cache long pouvant masquer une ancienne cotation.

**Validation SQL/Redis :** `check-explore-pagination` crée 300 Versus et trois trades sur une base PostgreSQL locale isolée. Un ancien marché situé au-delà des 100/250 derniers arrive premier par volume ; catégories avec accents, filtres d’âge/capitalisation/traders, Hot Take, égalités, page hors bornes et absence de trades sont vérifiés. 100 lecteurs répartis sur quatre adaptateurs réutilisent une projection de classement ; la publication suivante recharge seulement le marché affecté. Le test utilise également le vrai lecteur de détails : 12 IDs → un batch SQL, sans catalogue créé. Les fenêtres de volume retombent à zéro après 24 h d’inactivité sans relecture SQL.

Sur ce petit jeu synthétique avec statistiques PostgreSQL actualisées (`ANALYZE`), lecture complète du classement autour de **9 ms**, projection interne de **69 106 octets**, réponse de page de **18 586 octets**. Ce sont des mesures locales avec seulement trois trades, pas une estimation du trafic réel. Les premières tentatives sur tables fraîchement remplies sans statistiques avaient des plans beaucoup plus lents ; la sélection bornée, la matérialisation des vues et la suppression de jointures répétées ont été vérifiées, mais des plans représentatifs de production restent nécessaires. [Preuve SQL](audit-followup-2026-10-23/explore-postgres.json).

`check-cache-resilience` couvre les pannes de lecture, réservation, écriture et libération avec Redis local : 100 lecteurs d’un processus partagent une seule lecture SQL ; un échec SQL n’est pas rejoué comme une panne de cache. Isolation des tokens, invalidation des métadonnées et remplissage concurrent avec un trade sont également vérifiés. Les régressions d’agrégats passent sur 20 000 trades, ainsi que les tests de livraison, Profile, charts, marchés gradués, pagination et cadence live.

**Validation navigateur :** Chrome sur le build de production local, aux largeurs 1 440 et 390 px, avec 300 marchés synthétiques et les requêtes externes bloquées. Le parcours vérifie la page 3 conservée après un rafraîchissement réordonnant les résultats, le passage en tableau de 12 lignes, la présence d’un ancien marché, les filtres, leur réinitialisation, une réponse API 503 puis une reprise réussie. Aucune erreur JavaScript de page sur ces deux parcours. Le test a révélé un menu de filtres rogné sur les pages courtes : son débordement et son placement au-dessus du pied de page sont corrigés. [Preuve navigateur](audit-followup-2026-10-23/explore-browser.json). Cette validation fonctionnelle ne mesure pas le LCP ou l’INP de production.

**Vérifications finales :** `npm run build` (Turbopack et TypeScript), `npm run lint` et `git diff --check` réussis. Le build final a été exécuté hors du bac à sable après blocage de la compilation dans celui-ci. Aucun déploiement applicatif effectué dans ce lot.

**Limites restantes :** le classement est partagé mais son premier remplissage, sa mémoire, son tri et sa sérialisation croissent avec le nombre de Versus et d’horodatages actifs. Profile suit encore le feed global, avec regroupement de cinq secondes. L’API historique `/api/versus` garde sa réponse et sa limite pour compatibilité : les ventilations Analytics qui l’utilisent ne sont pas corrigées par la pagination Explore. Aucun gain LCP/INP de terrain ni coût du journal sur trafic réel n’est établi.

## Sixième lot local — Analytics, Leaderboard, Profile et pages publiques — 23–25 octobre 2026

**Corrections locales terminées, sans nouvelle migration ni déploiement.** Les limites des sections précédentes décrivent leur état à la date du lot ; cette section actualise celles d'Analytics, Leaderboard, Profile et du chargement public.

| Chantier | Résultat vérifié |
| --- | --- |
| Analytics | Catégories et totaux calculés sur tous les trades indexés de la période sélectionnée, dans le même scan agrégé SQL (`GROUPING SETS`). Deux lectures SQL restent nécessaires, agrégats et buckets, sans troisième requête pour les catégories. Le top 8 utilise le classement global Explore par capitalisation ; plus de dépendance à la liste des 100 derniers marchés. Requêtes de périodes mutualisées, série hebdomadaire fictive supprimée, unités ETH/USD et date réelle du snapshot affichées. |
| A12 — Leaderboard | Projection globale mise en cache dans Redis pendant 30 secondes, partagée entre recherches, pages et tris. Rangs PNL/volume calculés avant filtrage ; badges et conversion USD limités à la page demandée. Agrégats créateur/referral regroupés au lieu de jointures répétées par ligne. Budget de recherche et cache HTTP existants conservés. |
| Profile/live | Abonnement SSE authentifié au wallet du cookie ; rafraîchissement sur changement personnel (trader, créateur, referrer) ou prix des positions suivies. Jusqu'à 25 tokens, conformément à la limite existante du calcul PNL ; au-delà, le PNL reste indisponible et la liste de suivi des prix est vide. Premier trade couvert par le ciblage wallet. Reset et acteurs inconnus déclenchent une récupération conservatrice. Les hashes internes des acteurs ne sont jamais exposés dans le feed public. |
| A14 — pages publiques | Concept, Earn, Privacy et Terms ont un layout léger et statique. Le SDK wallet se charge au clic sur Connect ou pour restaurer un navigateur ayant déjà un cookie Wagmi. Le contenu public conserve son DOM lors de cette activation. Préchargement des liens vers les routes interactives désactivé sur ces pages. Le cookie brut est conservé à l'entrée du layout interactif, avec récupération d'un cookie malformé. |
| P3 — partage/nettoyage | Une horloge minute partagée entre cartes/listes, arrêtée sans abonné ; lecture referral mutualisée entre panneaux avec isolation des wallets et annulation avant effacement. Cinq fichiers inutilisés et douze règles CSS strictement dupliquées supprimés. Les dépendances x402 sont conservées : le SDK Coinbase les utilise indirectement, ce que la compilation confirme. |
| CI | `npm test` : 22 vérifications isolées ; `npm run test:integration` : 8 vérifications PostgreSQL/Redis locales ; `npm run test:all` : les 30. Workflow GitHub Actions préparé avec Node 22.18, PostgreSQL 15 et Redis 7, installation, lint, tests et build. Aucun secret de production ni déploiement. Le workflow n'a pas encore été exécuté sur GitHub. |

**Redis et SQL :** aucun nouveau timer SQL par utilisateur. La projection Leaderboard est remplie à la demande, avec cache partagé de 30 secondes ; la promesse de remplissage concurrent reste mutualisée par processus, sans verrou global de démarrage à froid. Les snapshots live gardent leur invalidation événementielle et leur rétention inactive de 600 secondes. Profile garde la cadence événementielle de cinq secondes et son secours préexistant d'une minute seulement lorsque SSE est indisponible. Reconnexion, focus, reset et événements non attribuables peuvent toujours rafraîchir les statistiques.

**Preuve SQL locale renouvelée le 25 octobre (heure de Paris) :** 300 marchés synthétiques ; les catégories incluent l'ancien marché, les bornes jour/semaine sont vérifiées, et 100 recherches/tris Leaderboard partagent deux lectures SQL au total (configuration et classement), avec rangs globaux conservés. Le scénario commence avec trois trades, puis ajoute un quatrième pour Leaderboard. [Résultats](audit-followup-2026-10-25/analytics-leaderboard.json). Ce test ne mesure pas le coût d'un classement contenant des millions de traders ni les plans de production.

**Navigateur sur le build final :** Chrome, largeurs 1 440 et 390 px, données synthétiques et requêtes externes bloquées. Privacy charge **528 647 octets de JS décodé** en 10 fichiers ; **2 312 677 octets supplémentaires** sont différés jusqu'à l'ouverture du wallet. Ces valeurs sont des ressources JS non compressées, pas le transfert réseau compressé, ni une mesure de LCP/INP. La modale s'ouvre, le DOM public reste identique et la navigation vers Explore avec le cookie Wagmi fonctionne. Analytics affiche la catégorie et l'ancien marché attendus, sans appeler la liste historique `/api/versus`. [Preuve publique/Analytics](audit-followup-2026-10-25/public-browser.json).

Explore est également revérifié sur les deux largeurs : pagination conservée après rafraîchissement, tableau, filtres, ancien marché, état vide et reprise après erreur API ; aucune erreur JavaScript de page. [Preuve Explore](audit-followup-2026-10-25/explore-browser.json). Le test SSE couvre l'authentification, les événements sans rapport, les positions détenues, les resets, la confidentialité des acteurs et l'annulation du stream.

**Validation :** build de production et TypeScript réussis le 23 octobre après les dernières modifications applicatives ; 8 vérifications d'intégration réussies ce jour-là. Les 22 vérifications isolées et le lint repassent le 25, ainsi que le scénario SQL ci-dessus et les deux parcours navigateur sur ce build. `git diff --check` est propre. L'audit npm du 23 octobre signale **0 vulnérabilité**, développement inclus ; il remplace le constat historique des cinq entrées ESLint, sans garantir l'absence de futurs avis. [Relevé npm daté du 23](audit-followup-2026-10-25/npm-audit-2026-10-23.json).

**Reste à faire hors de ce lot local :** déployer ensemble lecteurs, publishers et clients ; vérifier ensuite les transactions/signatures avec une extension wallet réelle, la première exécution GitHub Actions, les p75 LCP/INP de terrain, les waterfalls hébergés, les plans SQL représentatifs, hit/miss/évictions Redis et le coût/rattrapage du journal sur trafic réel. La projection globale conserve un coût proportionnel au nombre de traders/marchés ; sa capacité en production n'est pas certifiée. Une refonte générale des gros fichiers CSS ou la suppression des anciennes tables ne fait pas partie des corrections réalisées.

## Vérification finale avant déploiement — 25 octobre 2026

**Résultat : vérifications fonctionnelles réussies ; réserve de sécurité dépendances à traiter avant déploiement.** Le code applicatif et les dépendances n'ont pas été modifiés pendant cette vérification. Le changement visuel précédent (bordure Connect Wallet en dark) est inclus dans le build. Aucun déploiement ni nouvelle migration distante.

| Vérification relancée | Résultat |
| --- | --- |
| `npm run lint` | Réussi, code de sortie 0 |
| `npm run build` | Réussi, TypeScript inclus ; Concept/Earn/Privacy/Terms statiques, routes interactives dynamiques |
| `npm run test:all` | 22 vérifications isolées + 8 intégrations PostgreSQL/Redis réussies |
| `git diff --check` | Réussi |
| `npm audit --json` | Code 1 : 17 entrées élevées, 0 critique |
| `npm audit --omit=dev --json` | Code 1 : mêmes 17 entrées élevées dans l'arbre de production |

Preuves : [bilan et empreinte du lockfile](audit-followup-2026-10-25/verification-final.json), [journal des 30 vérifications](audit-followup-2026-10-25/tests-final.log), [build final](audit-followup-2026-10-25/build-final.log), [audit complet](audit-followup-2026-10-25/npm-audit-final.json), [audit de production](audit-followup-2026-10-25/npm-audit-production-final.json). Les tests d'intégration utilisent uniquement des services locaux et des jeux synthétiques, y compris 20 000 trades. Les parcours navigateur du même jour restent ceux du sixième lot ; ils n'ont pas été relancés pour la seule bordure CSS ajoutée ensuite. Node local est indiqué dans la preuve ; le workflow GitHub sous Node 22.18 n'a pas encore tourné.

### A00 rouvert — Zod et dépendances wallet

Les 17 entrées sont des paquets affectés directement ou par propagation d'**un seul avis**, pas 17 failles indépendantes : [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), portant sur une consommation mémoire excessive lors de validations de grandes collections. L'avis couvre les versions `<4.6.6` et donne `4.6.6` comme version corrigée. L'arbre contient notamment Zod 3.22.4, 3.25.76 et 4.5.4. L'exploitabilité d'un parcours Korum n'est pas démontrée par ce relevé ; l'absence d'import Zod direct dans `app/` ne neutralise pas les usages des SDK.

Les contraintes publiées vérifiées restent `3.22.4` pour `@reown/appkit-wallet`, `^3.24.2` pour `@x402/core` et `^3.25.76` pour `@coinbase/cdp-sdk`. Un passage forcé de tous les consommateurs à Zod 4 n'est donc pas une correction compatible démontrée. Les propositions npm incluent des rétrogradations de Wagmi et x402 ; elles n'ont pas été appliquées. Une mise à jour compatible des consommateurs Zod 4 peut corriger une partie de l'arbre, mais ne résout pas les copies Zod 3 imposées par les SDK wallet. Le lockfile est conservé afin que le bilan corresponde exactement aux dépendances testées.

**Prochaine action :** traiter cette compatibilité/dépendance dans un lot ciblé, réauditer puis revérifier les parcours wallet avant mise en service. Le relevé à zéro du 23 octobre est conservé comme historique et ne décrit plus l'état de sécurité actuel.

### Documentation remise en cohérence

- Nouveau [document frontend](frontend-architecture.md) : layouts publics/interactifs, chargement wallet différé, cookies bruts, état privé, horloge partagée et vérifications.
- [Architecture referral/indexer](referral-and-indexer-architecture.md) : consommation de nonce, migrations 0016–0019, watchlist IDs, classement global, durées des caches et ciblage Profile.
- [Live](market-live.md) : correction de l'ancienne description « 96 derniers trades », buckets exacts, 96 points de 15 minutes et distinction entre classement complet et catalogue historique.
- [Images](token-images.md) : réservation de 90 secondes, libération de la connexion pendant Pinata, contrôle du propriétaire et reprise.
- README et changelog : architecture actuelle, statut des contrôles, bordure dark et nouvelle réserve Zod. Les anciens comptes/résultats du rapport restent datés plutôt que réécrits.

## Périmètre et vérifications

Analyse transversale des routes Next.js, composants, hooks, authentification, appels RPC, accès SQL, caches Redis, notifications live, migrations, pipeline d'indexation, dépendances et styles. Inventaire de 162 fichiers TS/TSX/CSS sous `app/`. Consultation de la documentation locale de Next.js 16.3.4, notamment cache, rendu dynamique et préparation à la production.

| Vérification | Résultat |
| --- | --- |
| `npx next typegen` | Réussite |
| `npx tsc --noEmit --incremental false` | Réussite |
| `npm run lint` | Réussite, aucune erreur ni avertissement |
| `npm run build -- --webpack` | Réussite |
| 17 scripts existants exécutés | 14 réussites, 3 échecs de maintenance des tests |
| Tests Redis | Réussite sur une instance locale temporaire, sans persistance |
| Reproductions supplémentaires | Multiplication des lectures watchlist, réponse tardive après déconnexion, refresh anonyme, rejeu de challenge, fraîcheur du cache |
| `npm audit --json` | 14 entrées affectées : 1 critique, 11 élevées, 2 modérées |
| `npm audit --omit=dev --json` | 9 entrées affectées : 1 critique, 6 élevées, 2 modérées |

Le build vérifié est celui de Webpack ; le build Turbopack par défaut n'a pas été exécuté. Environnement local : Node.js 26.10.0. Les scripts de tests ont utilisé des mocks SQL/RPC et, pour les caches, Redis 8.10.2 local. Aucune migration, transaction blockchain, écriture en base de production ou publication n'a été effectuée.

Complément runtime du 21 octobre : malgré un nouvel échec du navigateur intégré (`Cannot redefine property: process`), des mesures ont été obtenues avec Chrome headless indépendant, ainsi que les métriques Railway et la volumétrie PostgreSQL réelle. Voir le complément en fin de rapport et les preuves dans `audit-runtime-2026-10-21/`. Les plans SQL `EXPLAIN ANALYZE` sur charge représentative, les métriques utilisateurs réels LCP/INP et les compteurs internes Redis restent absents. Les contrats présents sont des ABI et manifests, pas les sources Solidity : cet audit ne certifie pas les smart contracts.

## Constats prioritaires

### A00 — P1 — Mettre à jour les dépendances signalées vulnérables

**Emplacements :** `package.json:26`, `package.json:30`, `package.json:46`, `package-lock.json`.

Les audits npm ont été effectués après autorisation explicite de transmettre les métadonnées des dépendances au registre npm. Les nombres ci-dessus sont les entrées de paquets calculées par npm, avec propagation aux dépendants, pas autant de failles distinctes et exploitables dans cette application.

| Dépendance installée | Signal et contexte |
| --- | --- |
| `next@16.3.4` | Avis critique sur le rendu Node de `next/og`, plus d'autres avis. Aucun usage de `next/og`/`ImageResponse` trouvé : le chemin de la faille critique n'est pas identifié dans le projet. L'avis critique est corrigé en 16.3.6 ; npm propose 16.4.2 pour l'ensemble des alertes. |
| `sharp@0.35.4` | Avis élevé sur librsvg ; version corrigée 0.35.5. Les uploads appellent `metadata()` avant de rejeter les formats non autorisés. Le refus applicatif des SVG ne prouve donc pas à lui seul que le parseur natif n'est jamais sollicité. L'exploitabilité dépend aussi du runtime Linux et n'a pas été démontrée. |
| `axios@1.18.0` | Plusieurs avis, notamment de déni de service ; l'override global maintient cette version dans la chaîne `wagmi → @wagmi/connectors → @base-org/account → @coinbase/cdp-sdk`. Les plages affectées retournées par npm s'arrêtent avant 1.20.0. |
| `follow-redirects@1.16.0` | Avis élevés de mauvaise suppression de headers sensibles ; correctif indiqué à partir de 1.16.1. Dépendance d'Axios. |
| `hono@4.13.7` | Avis modéré concernant `serveStatic`, via le connecteur Porto. Aucun serveur Hono applicatif trouvé. |
| Autres | `fast-uri`, `source-map-js` et une chaîne d'outils ESLint/glob apparaissent également dans les rapports ; distinguer les chemins runtime des outils de développement avant de classer leur exposition. |

L'avis officiel Next précise les conditions du problème `ImageResponse` : contenu SVG contrôlé par un attaquant dans le renderer Node. [Avis Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j). L'avis SSRF de l'optimiseur concerne des URLs distantes autorisées ; aucun `images.remotePatterns` n'est configuré ici, ce qui écarte ce scénario selon l'éditeur. [Avis SSRF Next.js](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4).

Pour Sharp, l'éditeur recommande une mise à jour et documente le blocage du loader SVG comme mitigation. [Avis Sharp/librsvg](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w). Les détails Axios et follow-redirects proviennent du résultat npm et des avis qu'il référence : [Axios ReDoS](https://github.com/advisories/GHSA-c29m-xwm3-cm6r), [follow-redirects](https://github.com/advisories/GHSA-q3jh-wrc6-jgq8).

**Correction :** préparer une mise à jour ciblée de Next/ESLint compatible, Sharp et de l'override Axios, puis régénérer le lockfile et relancer la suite. Ne pas appliquer aveuglément `npm audit fix --force` : npm propose notamment un retour d'`eslint-config-next` à 14.2.35 pour une alerte transitive, incohérent avec le framework actuel. Aucun paquet n'a été mis à jour dans cet audit.

### A01 — P1 — Une lecture complète de watchlist par carte

**Emplacements :** `app/components/explore/ExploreVsCard.tsx:70`, `app/hooks/useWatchlist.tsx:50`, `app/api/watchlist/route.ts:27`, `app/components/WatchlistView.tsx:13`.

Chaque carte instancie `useWatchlist()`. Ce hook possède ses propres états et lance son propre `fetch('/api/watchlist')` au montage. Il n'utilise ni cache de requête partagé ni provider de watchlist. La réponse contient les IDs **et les objets Debate complets**, alors que la carte a seulement besoin de savoir si son ID est favori.

**Reproduction :** 12 instances du hook avec une session authentifiée produisent 12 GET indépendants. C'est le nombre de cartes d'une page Explore. Sur Watchlist, la lecture du parent s'ajoute aux lectures de ses cartes. Chaque instance ouvre aussi son propre BroadcastChannel ; un signal provenant d'un autre onglet déclenche autant de lectures que d'instances.

**Impact :** requêtes HTTP, accès Redis, sérialisation et transfert de payload redondants. Le cache serveur peut éviter une partie du SQL, mais pas ces coûts. Les remounts et changements de page répètent le phénomène.

**Correction :** centraliser les IDs dans une requête TanStack Query identifiée par le wallet et le déploiement ; séparer les IDs des données complètes ; faire partager la mutation et son état optimiste à tous les consommateurs.

### A02 — P1 — Un webhook backend manquant peut laisser un cache actif périmé sans limite de fraîcheur

**Emplacements :** `app/lib/cache/maintained.ts:17`, `app/lib/live/chart-cache.ts:16`, `app/lib/db/debates.ts:651`, `app/hooks/useProfileStats.ts:26`.

Les lectures prolongent la durée de rétention des snapshots. Cette durée est un délai d'inactivité, pas une durée maximale de fraîcheur. Pour les charts, `builtAt` est validé comme nombre mais n'est jamais comparé à une limite d'âge. La réconciliation des métadonnées ne couvre pas les changements ordinaires dans `camp_trades` ou les agrégats des traders.

**Scénario :** un trade est enregistré en PostgreSQL mais sa notification backend n'est pas publiée ou livrée ; aucun événement ultérieur ne répare le snapshot concerné ; le snapshot continue à être lu. Les GET de récupération relisent alors le même cache et prolongent sa durée de vie. Le simple retour de la connexion SSE ne force pas une lecture de la source.

**Reproduction :** après modification du chargeur simulé de prix 1 à prix 2, une lecture renvoie toujours 1 et renouvelle la rétention à 600 secondes, sans rappeler le chargeur. Un chart dont `builtAt` remonte à sept jours est accepté si la révision correspond.

**Nuance :** la perte d'un message entre serveur et navigateur, après mise à jour correcte de Redis, est un cas différent que les lectures HTTP peuvent réparer. Le problème décrit ici concerne la livraison vers le backend/cache.

**Correction :** ajouter une réconciliation bornée avec la source — curseur/version fiable couvrant aussi corrections et suppressions, avec détection ciblée et mutualisée des écarts — et surveiller le retard de livraison. Conserver les protections contre les reconstructions concurrentes.

### A03 — P1 — Le chemin live reconstruit des données historiques de taille croissante

**Emplacements :** `app/lib/live/server.ts:131`, `app/lib/live/debate-cache.ts:39`, `app/lib/db/debates.ts:565`, `app/lib/db/debates.ts:603`, `app/lib/live/debate-snapshot.ts:13`.

Chaque batch live affectant un Versus chaud peut rappeler le chargeur complet de ses lignes. Celui-ci recompte les traders distincts sur l'historique et agrège en JSON tous les trades des dernières 24 heures pour chaque camp. Le catalog Redis est ensuite resérialisé. Les lectures publiques reparcourent ces fenêtres brutes pour calculer volumes et variations.

Cela constitue plusieurs parcours historiques corrélés par Versus, pas un nombre constant d'opérations par nouveau trade. Le pipeline configure un flush webhook de 250 ms. Les retries de publication peuvent recommencer une partie de ce travail.

**Facteur aggravant :** `sharedRows([id])` charge d'abord le catalogue de jusqu'à 250 Versus lors d'un cache froid, même pour un détail ou une valorisation ciblée (`app/lib/db/debates.ts:676`).

**Impact :** coût SQL, taille Redis, parsing JSON et CPU qui augmentent avec les échanges. C'est un risque structurel confirmé par le chemin d'appel ; aucune durée de requête en production n'est affirmée.

**Correction :** fournir des agrégats incrémentaux et des buckets de fenêtres temporelles, conserver un DTO léger pour Explore, éviter la reconstruction du catalogue pour un détail froid. Vérifier les plans SQL sur des volumes représentatifs avant de choisir les index ou projections.

## Autres corrections à planifier

### A04 — P2 — Une réponse watchlist tardive peut restaurer les données du wallet précédent

**Emplacement :** `app/hooks/useWatchlist.tsx:50`.

`load()` ne vérifie pas que le wallet est toujours celui qui a déclenché la requête et n'annule pas les requêtes lors du nettoyage de l'effet. Les événements locaux ne portent pas non plus d'identité de wallet.

**Reproduction :** lancer une lecture pour A, déconnecter A et vider les IDs, puis résoudre l'ancienne réponse avec `[42]` ; le hook réaffiche `[42]`. Les mutations et leur rollback présentent le même défaut de rattachement à une session.

Il s'agit d'une mauvaise isolation de l'état dans le navigateur, pas d'un contournement de l'authentification de l'API. Utiliser une clé par wallet, annuler les lectures et ignorer les réponses ou rollbacks appartenant à une ancienne session.

### A05 — P2 — Les visiteurs anonymes provoquent un refresh serveur évitable

**Emplacements :** `app/components/WalletProvider.tsx:168`, `app/components/WalletProvider.tsx:67`.

Au montage sans wallet connecté, l'effet appelle `signOut()`, qui effectue un DELETE de session puis `router.refresh()` même si aucune session n'existait.

**Reproduction isolée :** un montage anonyme entraîne un DELETE et un appel à `router.refresh()`. Le coût réel dépend ensuite de la page et des caches ; cela peut relancer le rendu et les lectures serveur de la page.

Faire parvenir au provider une indication minimale de présence de session et ne nettoyer/rafraîchir que si nécessaire, en conservant la gestion d'un cookie restauré après déconnexion du wallet.

### A06 — P2 — Un upload externe immobilise une connexion PostgreSQL

**Emplacements :** `app/lib/db/token-images.ts:10`, `app/lib/pinata.ts:17`, `app/lib/db/client.ts:19`.

L'appel Pinata se déroule dans une transaction SQL, après prise d'un verrou transactionnel. Son timeout est de 30 secondes ; le pool applicatif est limité à cinq connexions. Cinq uploads concurrents lents peuvent donc occuper tout le pool d'une instance, y compris au détriment des lectures de marché et des profils. Des uploads identiques en attente du verrou peuvent aussi consommer des connexions.

Déplacer l'upload hors de la transaction longue, en conservant la déduplication via un état réservé/repris, une file dédiée ou un mécanisme de lease. Ce risque est déduit du code, sans saturation volontaire d'un service réel.

### A07 — P2 — Les avoirs sont relus à chaque changement d'onglet Profil

**Emplacements :** `app/components/ProfileClient.tsx:693`, `app/lib/db/profile-holdings.ts:43`, `app/lib/contracts/server-client.ts:37`.

L'effet dépend de `activeTab` et exécute toujours `load()`. Passer d'Activity à Badges, par exemple, déclenche donc `/api/profile/holdings` sans afficher les avoirs. Le chargement initial reste utile à Information, qui affiche une synthèse.

Sur cache froid, la route peut lire jusqu'à 100 soldes token, par vagues de 12 appels `readContract`, ainsi que le solde natif. Le client serveur n'active ni batch HTTP ni multicall. Le cache de 20 secondes amortit les répétitions proches sans supprimer les requêtes navigateur.

Séparer chargement initial et polling conditionnel, partager une query avec `staleTime`, et évaluer un regroupement RPC compatible avec le réseau.

### A08 — P2 — Le live peut amplifier fortement les rafraîchissements HTTP

**Emplacements :** `app/hooks/useMarketLive.ts:52`, `app/hooks/useMarketLive.ts:70`, `app/lib/cache/redis.ts:130`.

Chaque notification programme à 250 ms l'invalidation des listes de Versus et du ticker actifs, en plus du polling de secours. Sous flux soutenu et réponses rapides, on peut approcher quatre cycles de rafraîchissement par seconde et par onglet. C'est un plafond théorique du code, pas un trafic mesuré. Le profil suit le feed global et peut être invalidé environ chaque seconde, même si le trade n'affecte pas son activité ni ses positions.

La révision Redis globale change aussi les clés de tous les caches `market:*`, y compris les historiques et venues d'autres tokens. Une modification de marché A peut donc rendre inutilisable une entrée encore valable pour B.

Conserver le live des charts, mais mettre à jour les données disponibles dans les messages et borner séparément la cadence des listes/ticker. Utiliser des révisions par ressource lorsque la cohérence le permet. Réduire le polling uniquement après avoir corrigé A02.

### A09 — P2 — Un changement de classement remonte Explore à la première page

**Emplacements :** `app/components/explore/VsListClient.tsx:203`, `app/components/explore/VsListClient.tsx:298`.

La clé React de `PaginatedResults` inclut la liste ordonnée de tous les IDs. Un changement de capitalisation ou de volume qui change l'ordre modifie donc la clé, remonte le composant et réinitialise `currentPage` à 1. Les cartes remontées relancent aussi A01.

Garder une identité de composant stable et réinitialiser la pagination pour les changements volontaires de filtres/tri ; borner la page courante quand le nombre de résultats diminue.

### A10 — P2 — La pagination et les classements Explore portent seulement sur les 100 plus récents

**Emplacements :** `app/lib/db/debates.ts:21`, `app/lib/db/debates.ts:425`, `app/components/explore/VsListClient.tsx:187`.

Le serveur fournit par défaut les 100 derniers Versus. Les tris, filtres et pages sont ensuite calculés uniquement dans ce sous-ensemble. Un ancien Versus très actif peut disparaître de Trending ou Volume dès que 100 créations plus récentes existent. Certaines ventilations Analytics utilisent également cette liste.

Remonter pagination, filtre et tri au serveur, ou rendre explicite le périmètre « 100 plus récents ». Un DTO de liste réduit doit accompagner cette correction pour ne pas remplacer la limite actuelle par un chargement illimité.

### A11 — P2 — Le challenge d'authentification n'est pas consommé côté serveur

**Emplacements :** `app/api/auth/verify/route.ts:27`, `app/api/auth/verify/route.ts:58`, `app/lib/auth/session.ts:107`.

La vérification valide le cookie signé et sa date, puis expire le cookie dans la réponse. Aucun état serveur ne marque le nonce comme utilisé.

**Reproduction :** avec une vraie signature EOA synthétique, en mockant seulement la base, deux soumissions du même cookie challenge et de la même signature obtiennent chacune HTTP 200 et créent une session. La validité du challenge est de cinq minutes.

Cela ne permet pas de fabriquer une signature ni de se connecter à un wallet arbitraire : il faut disposer du challenge signé et de sa signature. Cependant, l'usage unique du challenge n'est pas garanti. Consommer atomiquement le nonce après vérification, avant émission d'une session.

Autre coût évitable sur ce chemin : la route n'a pas de budget de tentatives. Une signature EOA invalide déclenche la vérification RPC de secours. Ajouter des bornes de payload/signature et un rate limit avant ce travail, en préservant les comptes contractuels.

### A12 — P2 — La recherche Leaderboard recalcule le classement global sans limitation de débit

**Emplacements :** `app/lib/db/leaderboard.ts:46`, `app/lib/db/leaderboard.ts:184`, `app/lib/db/leaderboard.ts:274`, `app/api/leaderboard/route.ts:5`.

Dès que `search` est non vide, la route contourne le cache. La requête calcule les positions et PNL, attribue les rangs globaux, puis filtre. Des recherches successives peuvent donc refaire tout ce travail. Le debounce de l'interface ne limite pas les appels directs à l'API, contrairement à `/api/versus/search`, qui dispose d'un rate limit.

Mettre en cache une projection de classement, appliquer une limitation côté serveur et mesurer les plans SQL. Ne pas changer la sémantique du rang global en poussant simplement le filtre avant le classement.

### A13 — P2 — Trois scripts de régression ne passent plus

| Script | Échec observé |
| --- | --- |
| `scripts/check-annual-analytics.mjs` | `Unmocked dependency ../explore/VsTable` |
| `scripts/check-creator-fee-claim.mjs` | `ReferralsPanel` reçoit des props sans `stats`, lecture de `referredVolumeUsd` sur `undefined` |
| `scripts/check-graduated-markets.mjs` | `Missing test dependency ./MarketStatIcon in app/components/VsDetailClient.tsx` |

Ce sont des défauts du dispositif de test observés, pas la preuve que les fonctionnalités correspondantes sont cassées dans l'application. Les scripts importent/transpilent les composants avec de nombreux mocks manuels, sensibles aux nouveaux imports.

Les 14 scripts réussis : `check-create-images`, `check-graduation-button`, `check-market-price-changes`, `check-profile-live`, `check-notification-isolation`, `check-wallet-session-isolation`, `check-token-images`, `check-avatar-images`, `check-referral-eligibility`, `check-market-live-chart`, `check-market-live-protocol`, `check-profile-pnl` (également avec `--redis`), `check-debate-cache`, `check-market-chart-cache`.

Les tests Redis couvrent notamment 100 lecteurs répartis sur quatre instances simulées, remplissage partagé, corrections et courses de publication. Ils passent, mais ne couvrent pas tous les scénarios métier de cet audit.

Réparer les trois scripts, ajouter une commande de suite qui échoue au premier test rouge ou agrège correctement les statuts, puis la brancher à une CI. Aucun workflow GitHub Actions suivi n'a été trouvé. Le README affirmant l'absence de tests automatisés est dépassé.

### A14 — P2 — Le socle global impose du rendu dynamique et un bundle conséquent aux pages publiques

**Emplacements :** `app/layout.tsx:39`, `app/layout.tsx:57`, `app/components/RainbowKitProvider.tsx:45`.

Le layout lit `headers()` pour hydrater Wagmi et monte toute la pile wallet. Le build classe toutes les pages applicatives, y compris Terms et Privacy, en rendu dynamique. Cette conséquence est conforme à la documentation Next locale, pas une erreur du framework.

Mesure des fichiers référencés par les manifests client du build Webpack, dédupliqués par chemin :

| Route | JS brut / gzip | CSS brut / gzip |
| --- | --- | --- |
| `/privacy` | 711 / 228 KiB | 258 / 46 KiB |
| `/explore` | 778 / 253 KiB | 267 / 49 KiB |
| `/vs/[id]` | 1 048 / 327 KiB | 317 / 57 KiB |

Ce sont des tailles d'artefacts référencés, pas un « First Load JS » officiel ni les octets effectivement transférés dans un navigateur. Elles excluent notamment les images, fonts et certains chunks communs/runtime ou chargés ultérieurement. Les fichiers partagés peuvent déjà être en cache lors d'une navigation.

Étudier une séparation des layouts publics et interactifs, ainsi que le chargement différé de fonctionnalités lourdes. Préserver la cohérence de l'hydratation et l'expérience de connexion du header. Valider ensuite avec un vrai profilage navigateur.

## Nettoyage et points secondaires

- **P3 — Dépendances sans usage trouvé :** `@x402/core`, `@x402/evm`, `@x402/extensions`, `@x402/svm` sont déclarées dans `package.json:20` mais aucun import/usage n'a été trouvé dans l'application ou les scripts. Leur présence gonfle l'installation et la surface de maintenance ; leur présence dans le bundle navigateur n'est pas établie. Vérifier l'intention, puis retirer les dépendances inutiles et régénérer le lockfile.
- **P3 — Fichiers sans consommateur trouvé :** `app/components/earn/EarnHeroStats.tsx`, `app/components/explore/ExploreVisualEffects.tsx`, `app/components/explore/HotTrending.tsx`, `app/components/explore/Ticker.tsx`, `app/lib/extractPage.ts`. Le dernier vise un ancien fichier `app/data/korum.html` absent. Les wrappers `StatsServer`, `TickerServer`, `VsListServer` sont de simples relais sans accès serveur ; ils peuvent être simplifiés mais ne constituent pas à eux seuls une lenteur significative.
- **P3 — CSS :** 12 086 lignes entre `globals.css` et `design-vdef.css`. Analyse PostCSS : 15 groupes de règles exactement dupliquées (même contexte d'at-rule, sélecteur et déclarations), par exemple `globals.css:5392` et `globals.css:10544`. Dédoublonner après vérification de la cascade ; deux règles identiques séparées par un override ne sont pas supprimables arbitrairement. Déplacer progressivement les styles propres aux pages vers leurs modules.
- **P3 — Horloges de cartes :** chaque carte crée un timer minute alors que la liste possède déjà une horloge (`ExploreVsCard.tsx:74`, `VsListClient.tsx:177`). Mutualiser ce signal. Le gain attendu est secondaire face aux appels réseau.
- **P3 — Referral :** les deux panneaux de trade instancient chacun `usePendingReferral`, qui effectue un fetch indépendant. Une query partagée éviterait les deux lectures identiques au montage authentifié.
- **P3 — Prévisualisation de création :** `CreateVersusForm.tsx:310` appelle deux fois `quoteCreatorInitialBuy` avec les mêmes arguments lorsque les quantités A et B sont égales. Réutiliser le résultat dans ce cas ; garder la revérification avant transaction.
- **P2 — Mode dégradé Redis :** `rememberJson` retourne directement `load()` si la lecture de révision échoue (`redis.ts:130`), avant la déduplication mémoire. Les snapshots maintenus de débats/profils ne rattrapent pas non plus toutes les erreurs Redis survenant après la connexion. Vérifier le comportement en panne intermittente : limiter les reconstructions simultanées sans servir silencieusement un prix trop ancien.
- **P2 — Erreurs de watchlist masquées :** le catch de `useWatchlist.tsx:68` remplace l'état par une liste vide. Une panne est ainsi présentée comme une absence de favoris. Conserver l'ancien résultat avec un état d'erreur explicite.

## Points solides constatés

- TypeScript strict, lint et build passent.
- Un seul EventSource partagé par onglet, avec nettoyage et gestion de visibilité ; fusion incrémentale des trades de chart et récupération des écarts.
- Verrous Redis et contrôle de révision pour éviter de publier un snapshot reconstruit sur une ancienne version ; tests de concurrence réussis.
- Plusieurs accès SQL déjà regroupés ou parallélisés ; agrégats trader existants et index temporels définis. Le problème n'est pas une absence générale de cache ou d'index.
- Routes privées généralement fondées sur la session serveur, pas sur une adresse libre envoyée par le client ; cookies HttpOnly, SameSite strict et signatures vérifiées.
- Uploads d'images authentifiés, bornés, décodés et recompressés ; tests de validation réussis.
- Simulation et confirmations de transactions prises en compte dans les parcours testés ; aucune transaction envoyée par cet audit.

## Ordre de correction conseillé

1. Préparer les mises à jour de sécurité ciblées ; mutualiser la watchlist et corriger l'isolation des réponses/mutations entre wallets ; réparer les trois tests existants.
2. Détecter et réparer les événements backend manquants par une réconciliation ciblée et mutualisée, sans recharge SQL périodique par wallet.
3. Réduire le coût du traitement live et sortir les uploads externes du pool transactionnel partagé.
4. Supprimer le refresh anonyme et les relectures d'avoirs liées aux onglets ; corriger le reset de pagination et son périmètre de 100 éléments.
5. Consommer les nonces et borner les endpoints coûteux ; améliorer les chemins Redis dégradés.
6. Optimiser le fond Explore responsable probable du LCP mobile mesuré (A15), puis remesurer ; vérifier les plans SQL et les parcours sur une volumétrie représentative, et poursuivre le nettoyage des bundles, CSS et dépendances.

Critères de validation : une lecture watchlist initiale par wallet/onglet, aucune réponse de A visible après passage à B, aucune réinitialisation de page sur simple update de marché, récupération d'un événement backend perdu dans un délai borné, rejet d'un challenge déjà consommé, aucun appel Pinata tenant une connexion SQL pendant sa durée, et suite de tests entièrement verte.

## Complément runtime — site déployé, 21 octobre 2026

### Cible et provenance

Cible : `https://korum-project-production.up.railway.app`. **Le nom du domaine contient « production », mais l'unique environnement Railway du projet s'appelle `staging`.** Les chiffres ci-dessous décrivent ce déploiement réel ; ils ne prouvent pas l'existence d'une autre production. Déploiement `4479f996-7723-4e68-98b9-cac8cba4031a`, commit `e0b50c0424166cc92d1870b316460955f1f4676b` (`v0.3.2`), région `iad`, démarré le 21 octobre à 00:33 UTC et déclaré réussi à 00:36 UTC. Il correspond au commit audité, sans la modification locale non publiée.

Trois services en ligne, une réplique chacun, aucune anomalie signalée par le statut Railway. Mesures en lecture seule ; aucune configuration, migration ni publication modifiée. Les visites anonymes exécutent le comportement normal du site, y compris les renouvellements de cache et le DELETE de leur propre session anonyme. Aucune transaction wallet envoyée.

### Trafic et ressources Railway

Fenêtre demandée : les 24 heures précédant la collecte, avant les nouvelles visites synthétiques démarrées vers 16:54 UTC. L'API renvoie les timestamps des buckets, mais pas les bornes exactes de la fenêtre. Les données incluent potentiellement des visites de test antérieures ; elles ne représentent pas 827 visiteurs uniques.

| Indicateur | Observation |
| --- | --- |
| Requêtes HTTP | 827 |
| 2xx / 3xx / 4xx / 5xx | 736 / 83 / 8 / 0 |
| Taux de 5xx | 0 % sur cette fenêtre |
| Logs HTTP récupérés | 501 entrées, du 21 octobre 05:17:34 au 11:47:56 UTC ; échantillon borné, pas la totalité des 24 h |
| Hors `/api/markets/live` | 480 requêtes : p50 17 ms, p95 111 ms, p99 216 ms, maximum 317 ms |
| SSE `/api/markets/live` | 21 connexions : médiane 21,046 s, maximum 240,023 s |

Les percentiles de l'échantillon sont calculés par rang supérieur sur `totalDuration`, au proxy Railway : ils ne sont ni des TTFB navigateur ni des percentiles journaliers exhaustifs. Les buckets HTTP Railway affichent parfois p95/p99 à 30 000 ms. Les connexions SSE restent ouvertes plusieurs minutes dans les logs : **il faut les exclure des objectifs de latence des réponses classiques**. Aucun endpoint hors SSE ne dépasse 317 ms dans cet échantillon ; cela ne garantit pas l'absence de requêtes lentes hors échantillon. Ne pas moyenner les percentiles des buckets.

| Service | Mémoire moyenne / pic, Mo décimaux | CPU_USAGE moyenne / pic, valeur Railway | Disque courant, Mo décimaux |
| --- | --- | --- | --- |
| Application | 194,5 / 230,2 | 0,000187 / 0,050465 | 0 signalé pour le volume |
| PostgreSQL | 55,8 / 90,9 | 0,000404 / 0,018364 | 119,0 |
| Redis | 9,88 / 10,46 | 0,001341 / 0,002657 | 51,1 |

1 441 points agrégés par service pour CPU/mémoire. La valeur `CPU_USAGE` est conservée dans l'unité brute retournée par Railway, sans conversion arbitraire en pourcentage. Limites courantes retournées : `CPU_LIMIT=8`, `MEMORY_LIMIT_GB=8` par service. Le disque de l'application à zéro n'est pas une mesure de la taille de son image. La faible consommation observée est cohérente avec le faible trafic ; elle ne valide pas les chemins coûteux à grande échelle. Les agrégations masquent également les pics plus courts que leur cadence.

**Confirmation de A01 dans les logs :** six GET `/api/watchlist` entre 11:43:52.596 et 11:43:52.602 UTC, soit environ 6 ms, avec des durées individuelles de 49 à 53 ms. Cette rafale concorde avec le chargement des six cartes et la reproduction isolée ; les logs anonymisés seuls ne permettent pas d'attribuer les six appels à une session précise.

Les 4xx de l'échantillon comprennent des avatars absents (404) et une requête notifications interrompue (499). Les préchargements annulés côté navigateur sont distingués des erreurs serveur. Tracing Railway et auto-instrumentation désactivés pour les trois services : aucune trace distribuée ne permet d'attribuer précisément une latence à SQL, Redis ou RPC.

Preuves : [métriques et logs anonymisés](audit-runtime-2026-10-21/railway.json), [disque, limites et état du tracing](audit-runtime-2026-10-21/railway-additional.json). Adresses IP, user-agents et adresses wallet retirés des logs conservés.

### Volumétrie PostgreSQL réelle

Connexion via l'URL publique existante, avec le client `postgres` déjà installé. Sessions configurées `default_transaction_read_only=on`, une connexion, délai maximal de 10 secondes par requête. Les tables étant petites, leurs nombres de lignes ont été vérifiés par `COUNT(*)`, et non simplement repris des estimations du catalogue. Mesures vers 16:55 UTC ; les comptes successifs ne constituent pas un snapshot transactionnel commun.

| Donnée | Nombre exact |
| --- | --- |
| `indexer_v2.versuses` | 6 |
| `indexer_v2.versus_camps` | 12 |
| `indexer_v2.camp_trades` | 64, dont 1 sur les dernières 24 h |
| Traders distincts dans ces trades | 5 |
| `indexer_v2.trader_positions` / `trader_totals` | 17 / 5 |
| `indexer_v2.camp_graduations` | 1 |
| `public.users` / `user_avatars` / `token_images` | 11 / 3 / 7 |
| `public.user_watchlist_v2` | 8 associations, pas 8 utilisateurs |
| Ancien `indexer` | 2 versus, 4 camps, 24 trades, 0 trade sur les dernières 24 h |
| Ancien `public.user_watchlist` | 2 associations |

Base entière : **10 540 735 octets, soit 10,05 Mio**, incluant les objets système. Plus grosse table avec index/TOAST : `indexer_v2.camp_trades`, 192 Kio. Le volume PostgreSQL Railway de 119 Mo inclut d'autres fichiers du cluster ; ces deux chiffres mesurent des périmètres différents. Dernier trade actif : 21 octobre 00:29:03 UTC ; dernier trade ancien schéma : 28 septembre 20:49:53 UTC.

Les compteurs PostgreSQL cumulés signalent 0 deadlock, 0 fichier temporaire et 0 octet temporaire ; 39 298 055 blocs trouvés en cache contre 1 684 lus. `stats_reset` est nul : **ne pas présenter ces compteurs comme une mesure sur 24 h**. Les millions d'accès index/seq_scan cumulés ne prouvent pas des lenteurs ; sur 64 lignes, un parcours séquentiel peut être le meilleur plan. `pg_stat_statements` n'est pas installé (seule extension : `plpgsql`) ; aucune extension n'a été ajoutée.

Cette volumétrie est très insuffisante pour valider A03 ou la pagination au-delà de 100 débats. La présence de l'ancien schéma est une piste de nettoyage après vérification des consommateurs et de la rétention, pas une autorisation de suppression.

Preuves : [tailles et compteurs](audit-runtime-2026-10-21/postgres-stats.json), [comptes exacts et activité agrégée](audit-runtime-2026-10-21/postgres-counts.json). Aucun contenu de ligne utilisateur exporté.

**Limite Redis :** SSH vers `ssh.railway.com:22` expire ; le service n'a ni proxy TCP public ni variable `REDIS_PUBLIC_URL`. La mémoire et le disque Railway sont mesurés, mais le nombre de clés, leur taille, hit/miss, évictions et slowlog restent inconnus. Aucun accès public n'a été créé pour contourner cette limite.

### Mesures navigateur : protocole et résultats

Chrome **155.0.8059.85**, headless indépendant, contexte neuf par passage, utilisateur anonyme sans wallet, cache HTTP désactivé. Le cache serveur n'est pas vidé ; le processus Chrome et l'hôte peuvent être chauds après le premier passage. Navigation directe, attente de `load` puis 8 secondes, interactions, puis une seconde supplémentaire avant capture. Aucun test de charge concurrent. La localisation réseau de la machine de mesure n'est pas certifiée.

- Desktop : viewport 1 440 × 900, DPR 1, CPU et réseau sans ralentissement artificiel.
- Mobile simulé : viewport 390 × 844, DPR 1, mode mobile/tactile, CPU ralenti ×4 ; latence CDP configurée à 150 ms, débit descendant 1,6 Mbit/s, montant 750 kbit/s. Ce n'est pas un téléphone physique ni un profil Lighthouse officiel.
- LCP collecté avec `PerformanceObserver`, avant la première interaction. Interactions collectées via Event Timing, seuil 16 ms, groupées conceptuellement par `interactionId` ; pointerdown/up/click d'une même interaction ne comptent pas comme trois interactions.
- Parcours Explore : quatre clics, `Table → Grid → Memes → All`. Mesure après chargement : elle ne décrit pas la réactivité pendant l'hydratation.

| Page / scénario | Passages | LCP | TTFB navigation | Plus longue interaction par visite |
| --- | --- | --- | --- | --- |
| Explore desktop | 3 | 1,280 / 1,136 / 0,732 s ; médiane **1,136 s** | 381 / 242 / 182 ms | **376 / 72 / 72 ms** |
| Explore mobile ralenti | 3 | 11,748 / 11,608 / 11,608 s ; médiane **11,608 s** | 343 / 193 / 206 ms | **104 / 88 / 88 ms** |
| Versus `/vs/1`, desktop, première visite | 1 | 1,016 s | 234 ms | Non mesurée : aucun clic sur cette visite |
| Versus `/vs/1`, desktop, parcours onglets | 1 | 0,644 s | 352 ms | **72 ms** sur quatre clics Activity → Holders → Top Traders → Community |
| Analytics, desktop, première visite | 1 | 0,428 s | 189 ms | Non mesurée : aucun clic sur cette visite |
| Analytics, desktop, parcours périodes | 1 | 0,428 s | 182 ms | **56 ms** sur trois clics Weekly → Monthly → Daily |

**Ces interactions donnent un indicateur INP de laboratoire sur un parcours court, pas l'INP réel du site.** Pour un faible nombre d'interactions, le maximum observé est pertinent ; il manque les parcours complets, les sessions authentifiées et la distribution des appareils. Aucun p75 utilisateurs réels n'est calculé. Le premier passage desktop atteint 376 ms sur le clic Table ; son callback click ne prend qu'environ 5 ms et son délai d'entrée environ 1,8 ms : une part importante du temps reste jusqu'au prochain rendu. Cela ne suffit pas à attribuer le problème à une fonction particulière.

Repères : LCP ≤ 2,5 s et INP ≤ 200 ms sont les seuils « bons » ; LCP > 4 s est mauvais. Ces seuils s'appliquent normalement au p75 des visites réelles. Les passages synthétiques signalent ici une faiblesse mobile, sans certifier un score Core Web Vitals. Références : [LCP, web.dev](https://web.dev/articles/lcp), [INP, web.dev](https://web.dev/articles/inp).

Trois premiers essais mobiles ont expiré dans le pilote sur `locator.pressSequentially` lors du scénario de recherche. Ils sont exclus des statistiques et conservés comme échecs de protocole dans les métadonnées ; ils ne démontrent pas à eux seuls un bug de recherche. Les trois passages mobiles du tableau sont les reprises complètes sur grille/catégories. La recherche et les parcours wallet restent non mesurés. Un premier essai d’interaction Versus a également expiré parce que le pilote recherchait un rôle `button` alors que les contrôles portent le rôle accessible `tab` ; cet essai est exclu des statistiques.

### Waterfall, transfert réel et nouvel enjeu mobile

Le [waterfall consultable hors ligne](audit-runtime-2026-10-21/waterfall.html) permet de sélectionner un passage et de filtrer API, erreurs/annulations ou requêtes avant interaction. Les [captures JSON](audit-runtime-2026-10-21/browser.json) contiennent les timings, statuts, types et tailles. Aucune ressource externe n'est chargée par le document HTML.

Les tailles suivantes sont les octets encodés retournés par `Network.loadingFinished` pour les réponses terminées. **C'est une borne inférieure du transfert réel** : les réponses annulées partiellement et le SSE encore ouvert ne sont pas comptabilisés. Les requêtes `data:` sont exclues. Les valeurs de query string sont retirées des preuves ; deux libellés identiques ne prouvent donc pas deux requêtes identiques.

| Scénario | Requêtes HTTP avant interaction | Réponses terminées avant interaction | Total capturé après parcours |
| --- | --- | --- | --- |
| Explore desktop | 90 à 94 | 2,36 à 2,37 Mio | 99 à 103 requêtes ; environ 2,36 à 2,37 Mio terminés |
| Explore mobile ralenti | 71 | environ 2,11 Mio | 81 requêtes ; environ 2,35 à 2,36 Mio terminés |
| Versus desktop, première visite | 90 | 1,64 Mio | Capture sans interaction |
| Analytics desktop, première visite | 79 | 1,39 Mio | Capture sans interaction |

Sur Explore, les réponses terminées représentent environ **1,30 Mo d'images, 944 ko de JavaScript, 51 ko de CSS et 53 ko de polices**, plus HTML/fetch/autres. Ce périmètre comprend des ressources préchargées pour d'autres routes et des modules chargés à l'exécution. Il est donc différent des seuls manifests Webpack de A14 ; le déploiement utilise aussi des noms de chunks différents du build local.

**A15 — P2 — Le fond Explore retarde fortement le LCP mobile mesuré.** `app/design-vdef.css:42` et `:51` placent `/design-vdef/home/dark.webp` en arrière-plan de `.explore-page::before`, sans variante mobile dans cette règle. Cette seule image transfère environ **753 ko** (735 Kio). En mobile ralenti, elle commence vers 1,28–1,39 s et termine vers 11,57–11,71 s ; le LCP final, attribué à un DIV, arrive vers 11,61–11,75 s. Cette concordance, répétée trois fois, et la règle CSS en font le principal candidat à optimiser. Le test n'isole pas causalement son coût de celui des autres téléchargements concurrents.

Prévoir une version mobile beaucoup plus légère et dimensionnée au viewport, puis vérifier la qualité visuelle et remesurer. Examiner également les images tierces de tokens et la concurrence avec les préchargements. Le TTFB mobile restant entre 193 et 343 ms, il ne peut pas expliquer seul les onze secondes de LCP.

Autres observations concrètes :

- **A05 confirmé dans le navigateur :** chaque visite Explore desktop anonyme déclenche un DELETE `/api/auth/session` vers 1,03–1,44 s, suivi de nouvelles lectures. Le feed `/api/markets/trades` est demandé deux fois au démarrage. Les timings concordent avec le refresh anonyme identifié dans le code.
- **Préchargements :** 28 à 32 requêtes RSC durant le parcours Explore desktop, et 23 à 25 requêtes annulées. Les préchargements Next peuvent être utiles ou annulés normalement ; ce n'est pas autant de bugs. Mesurer l'effet du retrait du refresh anonyme, puis limiter les préchargements aux destinations utiles, particulièrement sur connexion lente.
- **Image tierce absente :** une image de token hébergée sur `pbs.twimg.com` renvoie cinq 404 sur chacun des parcours Explore desktop, notamment lors des changements de présentation/catégorie. Prévoir un fallback et éviter de retenter la même URL cassée à chaque remount. L'ampleur des transferts répétés est accentuée par le cache HTTP désactivé de ce protocole.
- **Versus :** la première visite charge un chart puis son historique `before`, et répète ces deux lectures après le DELETE de session et la lecture `/api/versus/1`. Ce sont des lectures à rapprocher du refresh, pas une preuve que l'historique paginé initial est inutile.
- **Analytics :** les trois appels initiaux `/api/analytics?period=…` correspondent dans le code à `day`, `week` et `year` pour des affichages différents (`StatsClient.tsx:197–226`). Ils ne doivent pas être classés comme trois doublons sur la seule base du chemin anonymisé.

Priorité complémentaire : traiter A15 et les chargements d'images en même temps que le refresh anonyme. Conserver A01/A02 et les risques SQL/live dans le plan : la faible volumétrie actuelle masque leur coût potentiel. Restent à mesurer : p75 LCP/INP de terrain via RUM, parcours authentifiés, téléphone physique, gros jeux de données, plans SQL représentatifs et métriques internes Redis.
