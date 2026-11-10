# Guide des bonnes pratiques de code et développement

## Introduction

Ce guide rassemble des pratiques de développement applicables à tout projet logiciel. Elles ne dépendent d'aucun langage, framework ni plateforme, et s'appliquent dès le démarrage d'un nouveau projet.

Chaque règle tient en une ligne d'action, suivie de sa raison. La checklist finale sert de revue avant une livraison.

## Architecture et conception

Séparer le métier de la technique rend le code testable et remplaçable pièce par pièce.

- **Découper en couches** : un domaine (règles métier pures), une couche application (cas d'usage qui orchestrent le domaine) et des adapters (API externes, stockage, interface). Le domaine ne dépend de rien d'extérieur.
- **Faire passer chaque service externe par un contrat** : une interface unique (« paiement », « stockage »…) que chaque fournisseur implémente. Ajouter un fournisseur revient à écrire un adapter, sans toucher au métier.
- **Nommer les cas d'usage par ce qu'ils font** (`creerCommande`, `envoyerFacture`) plutôt que par la technique employée.
- **Borner le parallélisme** : lancer les traitements en parallèle avec une limite de concurrence, pour ne saturer ni les quotas d'API ni la machine.
- **Demander confirmation avant toute action irréversible ou visible par d'autres** (envoi, suppression) : l'outil propose, l'utilisateur décide.
- **Consigner les décisions d'architecture dans des ADR** (Architecture Decision Records) numérotés, et y renvoyer depuis le code ou la feuille de route quand un choix surprend.
- **Préférer dériver l'état plutôt que le synchroniser** : un état calculé à partir de la demande en cours évite les effets de bord et ignore naturellement les réponses périmées.

## Sécurité et secrets

Aucun secret ne doit vivre en clair, et aucune donnée externe ne doit être traitée comme une instruction.

- **Chiffrer les jetons et clés avec le coffre du système** (trousseau, DPAPI, `libsecret`…), jamais dans un fichier `.env` livré à l'utilisateur.
- **Utiliser OAuth avec PKCE** pour les applications de bureau ou mobiles, avec une redirection sur l'interface locale (`127.0.0.1`) : pas de secret client embarqué.
- **Demander le minimum de droits** : commencer par des portées en lecture, et n'ajouter l'écriture qu'après accord explicite (service informatique, utilisateur).
- **Encadrer les contenus externes envoyés à un modèle d'IA** (courriels, pages, documents) dans des délimiteurs clairs, et dire au modèle qu'il s'agit de données, pour limiter l'injection de consigne.
- **Exiger des sorties structurées** (schéma JSON) d'un modèle d'IA, et prévoir un repli quand il refuse ou répond hors format.
- **Signer le code livré** dans la CI, avec le certificat de l'organisation, pour éviter les alertes de sécurité à l'installation.

## Tests et validation

La CI fait foi : un changement n'est accepté que s'il passe des seuils chiffrés et automatiques.

| Niveau                          | Ce qu'on vérifie                                                                                      | Seuil ou déclencheur                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Unitaire (domaine, application) | Chaque règle métier et chaque cas d'usage                                                             | 100 % de couverture en CI                     |
| Mutation (domaine)              | Que les tests détectent vraiment les erreurs, pas seulement qu'ils exécutent le code                  | Score ≥ 80 %                                  |
| Contrat (adapters)              | Que chaque fournisseur respecte la même interface                                                     | Une seule suite rejouée sur tous les adapters |
| Évaluation IA                   | Qualité des réponses d'un modèle sur un jeu de référence anonymisé (ex. 50 cas avec réponse attendue) | À chaque changement de consigne ou de modèle  |
| Lancement de l'artefact         | L'exécutable empaqueté démarre réellement (ex. Playwright)                                            | En CI, sur l'OS cible                         |
| Essai réel                      | Usage par de vrais utilisateurs, sur de vraies données, dans chaque environnement visé                | Chaque défaut corrigé ou noté                 |

- **Tester sur un vrai environnement ce que la documentation ne garantit pas** (un champ d'API, un comportement de tenant), et prévoir le repli dès le départ.
- **Mesurer avant de choisir** : temps et coût d'une opération type, comparés entre réglages (par exemple niveau d'effort d'un modèle), plutôt que de supposer.

## Robustesse et pièges techniques

La plupart des pannes viennent de l'environnement et des dépendances, pas du code métier.

- **Prévoir un repli pour chaque dépendance incertaine** : un champ absent, un refus, un service indisponible doivent mener à un comportement défini, pas à un plantage.
- **Attendre chaque promesse** : une API qui devient asynchrone lors d'une mise à jour casse silencieusement le code qui ne l'attend pas.
- **Suivre les dépréciations à chaque montée de version** et migrer vers les variantes recommandées (souvent asynchrones) sans attendre leur suppression.
- **Ignorer les réponses périmées** : quand l'utilisateur relance une demande, la réponse de l'ancienne ne doit pas écraser la nouvelle.
- **Se méfier des variables d'environnement héritées** (terminal de l'éditeur, CI) : elles peuvent changer le mode de démarrage d'un outil. Les documenter et les retirer au lancement.
- **Vérifier le contenu du paquet livré** : les outils d'empaquetage peuvent embarquer des dépendances de développement ou celles du dépôt parent. Exclure explicitement ce qui n'a rien à faire dans l'artefact.
- **Rendre l'installation réparable** : quand une étape d'installation peut échouer (binaire non téléchargé), documenter la commande qui la relance.

## Organisation, livraison et documentation

Une étape est terminée quand un critère vérifiable est rempli, pas quand la liste de tâches semble faite.

1. **Découper le projet en phases**, chacune avec une ligne « Terminée quand : … » mesurable (seuil de CI, nombre d'utilisateurs, durée d'essai, absence d'alerte).
2. **Livrer d'abord un socle complet et testé**, puis un essai réel, puis le confort d'usage, puis le déploiement à grande échelle.
3. **Supprimer toute manipulation manuelle de fichiers pour l'utilisateur** : réglages, connexion, déconnexion et changement de compte passent par l'interface.
4. **Automatiser la chaîne de livraison** : construction, signature, test de lancement et mises à jour (auto-updater ou outil de déploiement de l'organisation).
5. **Documenter ce qu'il faut déployer** : identifiants d'application, inscriptions chez les fournisseurs, variables attendues.

- **Tenir une liste « Pièges rencontrés »** : symptôme, cause, contournement, et lien vers l'ADR ou le README. Elle évite à chacun de redécouvrir le même problème.
- **Garder la feuille de route vivante** : cocher ce qui est fait, et noter chaque défaut non corrigé plutôt que de l'oublier.

## Checklist avant livraison

- [ ] Le domaine ne dépend d'aucune bibliothèque externe ni d'aucun service.
- [ ] Chaque service externe passe par un contrat testé sur tous ses adapters.
- [ ] La CI exige 100 % de couverture et un score de mutation ≥ 80 % sur le domaine.
- [ ] Aucun secret en clair : jetons et clés sont chiffrés par le coffre du système.
- [ ] Les portées d'accès demandées sont les plus restreintes possibles.
- [ ] Les contenus externes envoyés à une IA sont encadrés, et ses sorties sont structurées avec un repli.
- [ ] Le jeu d'évaluation IA a été rejoué après le dernier changement de consigne ou de modèle.
- [ ] Toute action irréversible demande une confirmation.
- [ ] Aucune API dépréciée, et toutes les promesses sont attendues.
- [ ] L'artefact livré ne contient pas de dépendances de développement et démarre en CI.
- [ ] Le code est signé et les mises à jour sont automatisées.
- [ ] Le critère « Terminée quand » de la phase est rempli, et les pièges rencontrés sont documentés.
