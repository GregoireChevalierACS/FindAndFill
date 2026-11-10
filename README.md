# FindAndFill

Application de bureau qui automatise la saisie et le reporting comptables : lire des données (Excel, CSV, factures électroniques, relevés bancaires, PDF) et remplir d'autres fichiers ou logiciels comptables, sans ressaisie manuelle et sans IA (moteur de règles déterministe).

- Feuille de route : [feuille-de-route.md](feuille-de-route.md)
- Bonnes pratiques suivies : [bonnes-pratiques.md](bonnes-pratiques.md)

## Contribuer

`main` est protégée : toute modification passe par une branche et une pull request (fusion en squash, historique linéaire).

```sh
git switch -c feat/ma-modification
# ... commits ...
git push -u origin feat/ma-modification
gh pr create --fill
```

Aucune donnée comptable réelle ne doit être versionnée : les tests utilisent uniquement le jeu synthétique.
