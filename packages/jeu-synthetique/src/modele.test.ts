import { describe, expect, it } from 'vitest';
import { commandeEur, factureEur } from './agregats.js';
import {
  DEBUT_EXERCICE,
  FIN_EXERCICE,
  genererJeu,
  SOLDE_INITIAL_BANQUE,
  TAUX_EN_EUR,
} from './modele.js';

const jeu = genererJeu(2026);

describe('genererJeu', () => {
  it('est déterministe', () => {
    expect(genererJeu(2026)).toEqual(jeu);
    expect(genererJeu(2027)).not.toEqual(jeu);
  });

  it('produit un volume réaliste', () => {
    expect(jeu.affaires).toHaveLength(18);
    expect(jeu.ventes.length).toBeGreaterThan(18);
    expect(jeu.achats.length).toBeGreaterThanOrEqual(72);
    expect(jeu.achats.length).toBeLessThanOrEqual(120);
    expect(jeu.salaires).toHaveLength(12);
    expect(new Set(jeu.ventes.map((v) => v.affaire.client.devise))).toEqual(
      new Set(['EUR', 'USD', 'GBP']),
    );
  });

  it('numérote affaires et factures dans l’ordre chronologique', () => {
    const codes = jeu.affaires.map((a) => a.code);
    expect(codes[0]).toBe('AF26-001');
    expect([...jeu.affaires].sort((a, b) => a.dateCommande.localeCompare(b.dateCommande))).toEqual(
      jeu.affaires,
    );
    jeu.ventes.forEach((vente, index) => {
      expect(vente.numero).toBe(`FV26-${String(index + 1).padStart(4, '0')}`);
      if (index > 0) {
        expect(vente.date >= (jeu.ventes[index - 1]?.date ?? '')).toBe(true);
      }
    });
  });

  it('découpe chaque affaire en échéances 30 / 60 / 10 sans perte de centime', () => {
    for (const affaire of jeu.affaires) {
      const [acompte, livraison, reception] = affaire.echeances;
      const total = affaire.echeances.reduce((s, e) => s + e.montantDevise, 0);
      expect(acompte?.montantDevise).toBe(Math.round(total * 0.3));
      expect(livraison?.montantDevise).toBe(Math.round(total * 0.6));
      expect(reception?.montantDevise).toBe(
        total - Math.round(total * 0.3) - Math.round(total * 0.6),
      );
      for (const e of affaire.echeances) {
        expect(e.montantEur).toBe(Math.round(e.montantDevise * TAUX_EN_EUR[affaire.client.devise]));
      }
    }
  });

  it('ne facture que les échéances de l’exercice, avec la TVA du régime du client', () => {
    for (const vente of jeu.ventes) {
      expect(vente.date >= DEBUT_EXERCICE && vente.date <= FIN_EXERCICE).toBe(true);
      const tvaAttendue =
        vente.affaire.client.regimeTva === 'france' ? Math.round(vente.htEur * 0.2) : 0;
      expect(vente.tvaEur).toBe(tvaAttendue);
      expect(vente.ttcEur).toBe(vente.htEur + vente.tvaEur);
    }
    for (const affaire of jeu.affaires) {
      expect(factureEur(jeu, affaire)).toBeLessThanOrEqual(commandeEur(affaire));
    }
  });

  it('n’impute un achat qu’à une affaire déjà commandée', () => {
    for (const achat of jeu.achats) {
      expect(achat.ttc).toBe(achat.ht + achat.tva);
      if (achat.affaire !== null) {
        expect(achat.affaire.dateCommande <= achat.date).toBe(true);
      }
    }
    expect(jeu.achats.some((a) => a.affaire === null)).toBe(true);
    expect(jeu.achats.some((a) => a.affaire !== null)).toBe(true);
  });

  it('laisse ouvertes les créances et dettes réglées après la clôture', () => {
    for (const vente of jeu.ventes) {
      if (vente.dateEncaissement !== null) {
        expect(vente.dateEncaissement <= FIN_EXERCICE).toBe(true);
      }
    }
    expect(jeu.ventes.some((v) => v.dateEncaissement === null)).toBe(true);
    expect(jeu.achats.some((a) => a.datePaiement === null)).toBe(true);
  });

  it('produit des écritures toutes équilibrées', () => {
    for (const ecriture of jeu.ecritures) {
      const debit = ecriture.lignes.reduce((s, l) => s + l.debit, 0);
      const credit = ecriture.lignes.reduce((s, l) => s + l.credit, 0);
      expect(debit, ecriture.numero).toBe(credit);
      expect(debit).toBeGreaterThan(0);
    }
  });

  it('numérote les écritures par journal, dans l’ordre des dates', () => {
    const parJournal = Map.groupBy(jeu.ecritures, (e) => e.journal.code);
    expect([...parJournal.keys()].sort()).toEqual(['AC', 'AN', 'BQ', 'VE']);
    for (const [code, ecritures] of parJournal) {
      ecritures.forEach((ecriture, index) => {
        expect(ecriture.numero).toBe(`${code}${String(index + 1).padStart(6, '0')}`);
      });
    }
    jeu.ecritures.forEach((ecriture, index) => {
      if (index > 0) {
        expect(ecriture.date >= (jeu.ecritures[index - 1]?.date ?? '')).toBe(true);
      }
    });
  });

  it('ouvre l’exercice avec le solde bancaire initial', () => {
    const [premiere] = jeu.ecritures;
    expect(premiere?.journal.code).toBe('AN');
    expect(premiere?.lignes[0]).toMatchObject({ compte: '512000', debit: SOLDE_INITIAL_BANQUE });
  });

  it('porte le montant en devise sur la ligne client des ventes hors euro', () => {
    const vente = jeu.ecritures.find(
      (e) => e.journal.code === 'VE' && e.lignes.some((l) => l.devise !== null),
    );
    expect(vente?.lignes[0]?.compte).toBe('411000');
    expect(vente?.lignes[0]?.devise?.code).toMatch(/USD|GBP/);
  });
});
