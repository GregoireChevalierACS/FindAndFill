import type { CelluleARemplir, ModeleRemplissage } from '@findandfill/domain';
import { useMemo, useRef, useState } from 'react';
import type {
  ApiFindAndFill,
  ResultatConfirmation,
  ResultatPreparation,
} from '../../shared/api.js';
import {
  decrireAvertissement,
  decrireErreur,
  formaterMontant,
  nomDeFichier,
  resumerLignes,
} from './messages.js';

declare global {
  interface Window {
    readonly findAndFill: ApiFindAndFill;
  }
}

const api = (): ApiFindAndFill => window.findAndFill;

interface Selection {
  readonly modele: ModeleRemplissage | null;
  readonly sources: Readonly<Record<string, string>>;
  readonly gabarit: string | null;
}

function Fichier({
  chemin,
  onChoisir,
}: {
  chemin: string | undefined | null;
  onChoisir: () => void;
}) {
  return (
    <div className="fichier">
      <span className={chemin ? 'chemin' : 'chemin vide'} title={chemin ?? undefined}>
        {chemin ? nomDeFichier(chemin) : 'Aucun fichier'}
      </span>
      <button type="button" onClick={onChoisir}>
        Choisir…
      </button>
    </div>
  );
}

function Apercu({
  cellules,
  modele,
}: {
  cellules: readonly CelluleARemplir[];
  modele: ModeleRemplissage;
}) {
  const parOnglet = useMemo(() => Map.groupBy(cellules, (c) => c.onglet), [cellules]);
  const libelle = (id: string) => modele.sources.find((s) => s.id === id)?.libelle ?? id;
  return (
    <div className="onglets">
      {[...parOnglet].map(([onglet, liste]) => (
        <details key={onglet} open={parOnglet.size === 1}>
          <summary>
            {onglet} <span className="discret">— {liste.length} cellules</span>
          </summary>
          <table>
            <thead>
              <tr>
                <th>Cellule</th>
                <th className="nombre">Valeur</th>
                <th>Règle</th>
                <th>Source</th>
                <th>Lignes sources</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((cellule) => (
                <tr key={cellule.adresse}>
                  <td>{cellule.adresse}</td>
                  <td className="nombre">{formaterMontant(cellule.valeur)}</td>
                  <td>{cellule.provenance.regle}</td>
                  <td>{libelle(cellule.provenance.source)}</td>
                  <td className="discret">{resumerLignes(cellule.provenance.lignes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}

export function App() {
  const [selection, setSelection] = useState<Selection>({
    modele: null,
    sources: {},
    gabarit: null,
  });
  const [messageModele, setMessageModele] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ pour: Selection; valeur: ResultatPreparation } | null>(
    null,
  );
  const [enCours, setEnCours] = useState(false);
  const [enregistrement, setEnregistrement] = useState<ResultatConfirmation | null>(null);
  const derniereDemande = useRef(0);

  // L'aperçu n'est valable que pour la sélection qui l'a produit : tout changement l'efface.
  const apercu = resultat?.pour === selection ? resultat.valeur : null;
  const { modele, sources, gabarit } = selection;
  const complet =
    modele !== null && gabarit !== null && modele.sources.every((s) => sources[s.id] !== undefined);

  function choisir(nouvelle: Selection) {
    setSelection(nouvelle);
    setEnregistrement(null);
  }

  async function ouvrirModele() {
    const chemin = await api().choisirFichier('modele');
    if (chemin === null) return;
    const ouvert = await api().ouvrirModele(chemin);
    if (ouvert.ok) {
      setMessageModele(null);
      choisir({ modele: ouvert.modele, sources: {}, gabarit });
    } else {
      setMessageModele(ouvert.message);
    }
  }

  async function chargerDemonstration() {
    const demo = await api().chargerDemonstration();
    setMessageModele(`Jeu de démonstration généré dans ${demo.dossier}`);
    choisir({ modele: demo.modele, sources: demo.sources, gabarit: demo.gabarit });
  }

  async function choisirSource(id: string) {
    const chemin = await api().choisirFichier('source');
    if (chemin !== null) choisir({ ...selection, sources: { ...sources, [id]: chemin } });
  }

  async function choisirGabarit() {
    const chemin = await api().choisirFichier('gabarit');
    if (chemin !== null) choisir({ ...selection, gabarit: chemin });
  }

  async function preparer() {
    if (!complet) return;
    const numero = ++derniereDemande.current;
    const pour = selection;
    setEnCours(true);
    setEnregistrement(null);
    try {
      const valeur = await api().preparer({ modele, sources, gabarit });
      // Une réponse arrivée après une demande plus récente est ignorée.
      if (numero === derniereDemande.current) setResultat({ pour, valeur });
    } finally {
      if (numero === derniereDemande.current) setEnCours(false);
    }
  }

  async function confirmer() {
    if (apercu?.ok !== true) return;
    setEnregistrement(await api().confirmer(apercu.jeton));
  }

  return (
    <main>
      <header>
        <h1>FindAndFill</h1>
        <p className="discret">
          Remplir un reporting Excel à partir des exports comptables, sans ressaisie.
        </p>
      </header>

      <section>
        <h2>1. Modèle</h2>
        <div className="actions">
          <button type="button" onClick={() => void ouvrirModele()}>
            Ouvrir un modèle…
          </button>
          <button type="button" className="secondaire" onClick={() => void chargerDemonstration()}>
            Charger la démonstration
          </button>
        </div>
        {messageModele !== null && <p className="note">{messageModele}</p>}
        {modele !== null && (
          <p>
            <strong>{modele.nom}</strong> — exercice {modele.annee}, {modele.sources.length}{' '}
            source(s), {modele.regles.length} règle(s)
          </p>
        )}
      </section>

      {modele !== null && (
        <section>
          <h2>2. Fichiers</h2>
          <dl className="fichiers">
            {modele.sources.map((source) => (
              <div key={source.id}>
                <dt>{source.libelle}</dt>
                <dd>
                  <Fichier
                    chemin={sources[source.id]}
                    onChoisir={() => void choisirSource(source.id)}
                  />
                </dd>
              </div>
            ))}
            <div>
              <dt>Gabarit à remplir</dt>
              <dd>
                <Fichier chemin={gabarit} onChoisir={() => void choisirGabarit()} />
              </dd>
            </div>
          </dl>
          <button type="button" disabled={!complet || enCours} onClick={() => void preparer()}>
            {enCours ? 'Préparation…' : 'Préparer l’aperçu'}
          </button>
        </section>
      )}

      {apercu !== null && modele !== null && (
        <section aria-live="polite">
          <h2>3. Aperçu</h2>
          {apercu.ok ? (
            <>
              <p>
                <strong>{apercu.cellules.length} cellules</strong> seront remplies. Rien n’est écrit
                avant votre confirmation ; le gabarit d’origine n’est jamais modifié.
              </p>
              {apercu.avertissements.length > 0 && (
                <ul className="avertissements">
                  {apercu.avertissements.map((a, index) => (
                    <li key={index}>{decrireAvertissement(a, modele)}</li>
                  ))}
                </ul>
              )}
              <Apercu cellules={apercu.cellules} modele={modele} />
              <button type="button" onClick={() => void confirmer()}>
                Confirmer et enregistrer…
              </button>
              {enregistrement?.statut === 'enregistre' && (
                <p className="succes">Enregistré : {enregistrement.chemin}</p>
              )}
              {enregistrement?.statut === 'erreur' && (
                <p className="erreur-texte">{enregistrement.message}</p>
              )}
            </>
          ) : (
            <ul className="erreurs">
              {apercu.erreurs.map((erreur, index) => {
                const message = decrireErreur(erreur, modele);
                return (
                  <li key={index} className="erreur">
                    <strong>{message.titre}</strong>
                    {message.details.length > 0 && (
                      <ul>
                        {message.details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    )}
                    <p>{message.conseil}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
