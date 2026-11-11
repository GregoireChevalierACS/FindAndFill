import { lettresColonne, type Regle, type ValeurCellule } from '@findandfill/domain';
import { useState } from 'react';
import type { ApercuFeuille, ApercuOnglet } from '../../shared/api.js';
import { api } from './api.js';
import {
  ajouterRegle,
  ajouterSource,
  appliquerClic,
  choisirEntetes,
  depuisModele,
  fichiersPourRemplir,
  LIBELLES_TYPES,
  majRegle,
  problemes,
  regleDeType,
  remplacerFichierSource,
  renommerSource,
  retirerRegle,
  retirerSource,
  versModele,
  type Brouillon,
  type ChampCible,
  type SourceBrouillon,
  type TypeRegle,
} from './brouillon.js';
import { decrireProbleme, nomDeFichier } from './messages.js';
import type { Selection } from './Remplissage.js';

const TYPES = Object.keys(LIBELLES_TYPES) as TypeRegle[];
const LIGNES_SOURCE_AFFICHEES = 15;

const LIBELLES_CHAMPS: Readonly<Record<ChampCible, string>> = {
  colonneCles: 'Colonne des clés',
  premiereColonneMois: 'Colonne de janvier',
  colonne: 'Colonne',
  ligneJanvier: 'Ligne de janvier',
  adresse: 'Cellule',
};

function champsDeCible(regle: Regle): ChampCible[] {
  switch (regle.type) {
    case 'mensuel-par-cle':
      return ['colonneCles', 'premiereColonneMois'];
    case 'mensuel':
      return ['colonne', 'ligneJanvier'];
    case 'par-cle':
      return ['colonneCles', 'colonne'];
    case 'total':
      return ['adresse'];
  }
}

function texte(valeur: ValeurCellule | undefined): string {
  return valeur === null || valeur === undefined ? '' : String(valeur);
}

function ApercuSource({
  feuille,
  ligneEntetes,
  onChoisir,
}: {
  feuille: ApercuFeuille;
  ligneEntetes: number | null;
  onChoisir: (ligne: number) => void;
}) {
  const debut = Math.max(0, (ligneEntetes ?? 0) - 3);
  const lignes = feuille.lignes.slice(debut, debut + LIGNES_SOURCE_AFFICHEES);
  const largeur = Math.min(10, Math.max(1, ...lignes.map((l) => l.length)));
  return (
    <div className="grille-defilante">
      <table className="grille">
        <tbody>
          {lignes.map((ligne, i) => {
            const numero = debut + i;
            return (
              <tr
                key={numero}
                className={numero === ligneEntetes ? 'entetes' : undefined}
                onClick={() => {
                  onChoisir(numero);
                }}
                title="Cliquer pour choisir cette ligne comme en-têtes"
              >
                <th>{numero + 1}</th>
                {Array.from({ length: largeur }, (_, c) => (
                  <td key={c}>{texte(ligne[c])}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CarteSource({
  source,
  onBrouillon,
  onChoisirFichier,
}: {
  source: SourceBrouillon;
  onBrouillon: (transformer: (b: Brouillon) => Brouillon) => void;
  onChoisirFichier: () => void;
}) {
  const { fichier } = source;
  const feuille = fichier?.feuilles.find((f) => f.nom === fichier.onglet) ?? fichier?.feuilles[0];
  return (
    <div className="carte">
      <div className="ligne-champs">
        <label>
          Libellé
          <input
            value={source.libelle}
            onChange={(e) => {
              onBrouillon((b) => renommerSource(b, source.id, e.target.value));
            }}
          />
        </label>
        <span className="discret">Identifiant : {source.id}</span>
        <button type="button" className="secondaire" onClick={onChoisirFichier}>
          {fichier === null ? 'Choisir le fichier…' : 'Changer de fichier…'}
        </button>
        <button
          type="button"
          className="secondaire"
          onClick={() => {
            onBrouillon((b) => retirerSource(b, source.id));
          }}
        >
          Retirer
        </button>
      </div>
      {fichier !== null && (
        <>
          <p className="discret">
            {nomDeFichier(fichier.chemin)}
            {fichier.feuilles.length > 1 && (
              <>
                {' — onglet '}
                <select
                  aria-label={`Onglet de ${source.libelle}`}
                  value={fichier.onglet}
                  onChange={(e) => {
                    onBrouillon((b) => choisirEntetes(b, source.id, { onglet: e.target.value }));
                  }}
                >
                  {fichier.feuilles.map((f) => (
                    <option key={f.nom}>{f.nom}</option>
                  ))}
                </select>
              </>
            )}
          </p>
          {feuille !== undefined && (
            <ApercuSource
              feuille={feuille}
              ligneEntetes={fichier.ligneEntetes}
              onChoisir={(ligne) => {
                onBrouillon((b) => choisirEntetes(b, source.id, { ligneEntetes: ligne }));
              }}
            />
          )}
        </>
      )}
      <p>
        <strong>En-têtes :</strong>{' '}
        {source.empreinte.entetes.length === 0
          ? 'aucun — cliquez sur la ligne des en-têtes'
          : source.empreinte.entetes.filter((e) => e !== '').join(', ')}
      </p>
    </div>
  );
}

function ChoixColonne({
  libelle,
  valeur,
  entetes,
  facultatif = false,
  onChange,
}: {
  libelle: string;
  valeur: string;
  entetes: readonly string[];
  facultatif?: boolean;
  onChange: (valeur: string) => void;
}) {
  const options = entetes.filter((e) => e !== '');
  return (
    <label>
      {libelle}
      <select
        value={valeur}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        <option value="">{facultatif ? '— aucune —' : '— choisir —'}</option>
        {valeur !== '' && !options.includes(valeur) && (
          <option value={valeur}>{valeur} (absente)</option>
        )}
        {options.map((entete) => (
          <option key={entete} value={entete}>
            {entete}
          </option>
        ))}
      </select>
    </label>
  );
}

function CarteRegle({
  regle,
  brouillon,
  actif,
  onRegle,
  onRetirer,
  onViser,
}: {
  regle: Regle;
  brouillon: Brouillon;
  actif: ChampCible | null;
  onRegle: (regle: Regle) => void;
  onRetirer: () => void;
  onViser: (champ: ChampCible) => void;
}) {
  const entetes = brouillon.sources.find((s) => s.id === regle.source)?.empreinte.entetes ?? [];
  const onglets = brouillon.gabarit?.onglets.map((o) => o.nom) ?? [];
  const filtres = regle.filtres ?? [];
  const majFiltres = (nouveaux: NonNullable<Regle['filtres']>) => {
    onRegle({ ...regle, filtres: nouveaux });
  };
  return (
    <div className="carte">
      <div className="ligne-champs">
        <label>
          Identifiant
          <input
            value={regle.id}
            onChange={(e) => {
              onRegle({ ...regle, id: e.target.value });
            }}
          />
        </label>
        <label>
          Type
          <select
            value={regle.type}
            onChange={(e) => {
              onRegle(
                regleDeType(
                  e.target.value as TypeRegle,
                  { id: regle.id, source: regle.source, entetes, onglet: regle.cible.onglet },
                  regle,
                ),
              );
            }}
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {LIBELLES_TYPES[type].titre}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="secondaire" onClick={onRetirer}>
          Retirer la règle
        </button>
      </div>
      <p className="discret">{LIBELLES_TYPES[regle.type].aide}</p>

      <fieldset>
        <legend>Depuis la source</legend>
        <div className="ligne-champs">
          <label>
            Source
            <select
              value={regle.source}
              onChange={(e) => {
                onRegle({ ...regle, source: e.target.value });
              }}
            >
              <option value="">— choisir —</option>
              {brouillon.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </label>
          {'cle' in regle && (
            <ChoixColonne
              libelle="Colonne de la clé"
              valeur={regle.cle}
              entetes={entetes}
              onChange={(cle) => {
                onRegle({ ...regle, cle });
              }}
            />
          )}
          {'date' in regle && (
            <ChoixColonne
              libelle="Colonne de la date"
              valeur={regle.date}
              entetes={entetes}
              onChange={(date) => {
                onRegle({ ...regle, date });
              }}
            />
          )}
          <ChoixColonne
            libelle="Montant à ajouter"
            valeur={regle.montant.plus}
            entetes={entetes}
            onChange={(plus) => {
              onRegle({ ...regle, montant: { ...regle.montant, plus } });
            }}
          />
          <ChoixColonne
            libelle="Montant à retrancher"
            valeur={regle.montant.moins ?? ''}
            entetes={entetes}
            facultatif
            onChange={(moins) => {
              onRegle({ ...regle, montant: { ...regle.montant, moins } });
            }}
          />
        </div>
        {filtres.map((filtre, index) => (
          <div className="ligne-champs" key={index}>
            <ChoixColonne
              libelle="Seulement si"
              valeur={filtre.colonne}
              entetes={entetes}
              onChange={(colonne) => {
                majFiltres(filtres.map((f, i) => (i === index ? { ...f, colonne } : f)));
              }}
            />
            <label>
              Condition
              <select
                value={filtre.operateur}
                onChange={(e) => {
                  const operateur = e.target.value as 'egal' | 'different';
                  majFiltres(filtres.map((f, i) => (i === index ? { ...f, operateur } : f)));
                }}
              >
                <option value="egal">vaut</option>
                <option value="different">ne vaut pas</option>
              </select>
            </label>
            <label>
              Valeur
              <input
                value={filtre.valeur}
                onChange={(e) => {
                  const valeur = e.target.value;
                  majFiltres(filtres.map((f, i) => (i === index ? { ...f, valeur } : f)));
                }}
              />
            </label>
            <button
              type="button"
              className="secondaire"
              onClick={() => {
                majFiltres(filtres.filter((_, i) => i !== index));
              }}
            >
              Retirer le filtre
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondaire"
          onClick={() => {
            majFiltres([...filtres, { colonne: '', operateur: 'egal', valeur: '' }]);
          }}
        >
          Ajouter un filtre
        </button>
      </fieldset>

      <fieldset>
        <legend>Vers le gabarit</legend>
        <div className="ligne-champs">
          <label>
            Onglet
            <select
              value={regle.cible.onglet}
              onChange={(e) => {
                onRegle({ ...regle, cible: { ...regle.cible, onglet: e.target.value } } as Regle);
              }}
            >
              <option value="">— choisir —</option>
              {regle.cible.onglet !== '' && !onglets.includes(regle.cible.onglet) && (
                <option value={regle.cible.onglet}>{regle.cible.onglet} (absent)</option>
              )}
              {onglets.map((onglet) => (
                <option key={onglet}>{onglet}</option>
              ))}
            </select>
          </label>
          {champsDeCible(regle).map((champ) => {
            const valeur = (regle.cible as Record<string, string | number>)[champ] ?? '';
            return (
              <div key={champ} className="avec-bouton">
                <label>
                  {LIBELLES_CHAMPS[champ]}
                  <input
                    value={String(valeur)}
                    onChange={(e) => {
                      const saisie =
                        champ === 'ligneJanvier'
                          ? Number(e.target.value)
                          : e.target.value.toUpperCase();
                      onRegle({ ...regle, cible: { ...regle.cible, [champ]: saisie } } as Regle);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={actif === champ ? 'vise actif' : 'vise'}
                  title="Choisir en cliquant dans le gabarit"
                  aria-label={`Choisir « ${LIBELLES_CHAMPS[champ]} » dans le gabarit`}
                  onClick={() => {
                    onViser(champ);
                  }}
                >
                  Viser
                </button>
              </div>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function GrilleGabarit({
  onglet,
  enVisee,
  onClic,
}: {
  onglet: ApercuOnglet;
  enVisee: boolean;
  onClic: (ligne: number, colonne: number) => void;
}) {
  const largeur = onglet.grille[0]?.length ?? 0;
  return (
    <div className={enVisee ? 'grille-defilante en-visee' : 'grille-defilante'}>
      <table className="grille">
        <thead>
          <tr>
            <th />
            {Array.from({ length: largeur }, (_, c) => (
              <th key={c}>{lettresColonne(c + 1)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {onglet.grille.map((ligne, l) => (
            <tr key={l}>
              <th>{l + 1}</th>
              {ligne.map((cellule, c) => (
                <td
                  key={c}
                  className={cellule.formule ? 'formule' : undefined}
                  title={`${lettresColonne(c + 1)}${l + 1}`}
                  onClick={() => {
                    onClic(l + 1, c + 1);
                  }}
                >
                  {cellule.texte}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Écran « Modèle » : configurer sources, gabarit et règles sans écrire de JSON. */
export function Editeur({
  brouillon,
  onBrouillon,
  onRemplir,
}: {
  brouillon: Brouillon;
  onBrouillon: (transformer: (b: Brouillon) => Brouillon) => void;
  onRemplir: (selection: Selection) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [visee, setVisee] = useState<{ regle: number; champ: ChampCible } | null>(null);
  const [ongletAffiche, setOngletAffiche] = useState<string | null>(null);

  const liste = problemes(brouillon);
  const fichiers = fichiersPourRemplir(brouillon);
  const ongletCourant =
    brouillon.gabarit?.onglets.find((o) => o.nom === ongletAffiche) ??
    brouillon.gabarit?.onglets[0];

  async function ouvrirModele() {
    const chemin = await api().choisirFichier('modele');
    if (chemin === null) return;
    const ouvert = await api().ouvrirModele(chemin);
    if (ouvert.ok) {
      onBrouillon(() => depuisModele(ouvert.modele));
      setMessage('Modèle ouvert : choisissez de nouveau ses fichiers pour voir les aperçus.');
    } else {
      setMessage(ouvert.message);
    }
  }

  async function choisirSource(id?: string) {
    const chemin = await api().choisirFichier('source');
    if (chemin === null) return;
    const apercu = await api().apercuSource(chemin);
    if (!apercu.ok) {
      setMessage(apercu.message);
      return;
    }
    setMessage(null);
    onBrouillon((b) =>
      id === undefined
        ? ajouterSource(b, chemin, apercu.feuilles)
        : remplacerFichierSource(b, id, chemin, apercu.feuilles),
    );
  }

  async function choisirGabarit() {
    const chemin = await api().choisirFichier('gabarit');
    if (chemin === null) return;
    const apercu = await api().apercuGabarit(chemin);
    if (!apercu.ok) {
      setMessage(apercu.message);
      return;
    }
    setMessage(null);
    setOngletAffiche(null);
    onBrouillon((b) => ({ ...b, gabarit: { chemin, onglets: apercu.onglets } }));
  }

  async function enregistrer() {
    const resultat = await api().enregistrerModele(versModele(brouillon));
    if (resultat.statut === 'enregistre') setMessage(`Modèle enregistré : ${resultat.chemin}`);
    if (resultat.statut === 'erreur') setMessage(resultat.message);
  }

  function viser(regle: number, champ: ChampCible) {
    const enCours = visee?.regle === regle && visee.champ === champ;
    setVisee(enCours ? null : { regle, champ });
    const onglet = brouillon.regles[regle]?.cible.onglet;
    if (!enCours && onglet !== undefined && onglet !== '') setOngletAffiche(onglet);
  }

  function clicGabarit(ligne: number, colonne: number) {
    if (visee === null) return;
    const regle = brouillon.regles[visee.regle];
    if (regle === undefined) return;
    const avecOnglet =
      ongletCourant === undefined
        ? regle
        : ({ ...regle, cible: { ...regle.cible, onglet: ongletCourant.nom } } as Regle);
    onBrouillon((b) =>
      majRegle(b, visee.regle, appliquerClic(avecOnglet, visee.champ, ligne, colonne)),
    );
    setVisee(null);
  }

  return (
    <>
      <section>
        <h2>Modèle</h2>
        <div className="ligne-champs">
          <label>
            Nom
            <input
              value={brouillon.nom}
              onChange={(e) => {
                const nom = e.target.value;
                onBrouillon((b) => ({ ...b, nom }));
              }}
            />
          </label>
          <label>
            Exercice
            <input
              type="number"
              value={brouillon.annee}
              onChange={(e) => {
                const annee = Number(e.target.value);
                onBrouillon((b) => ({ ...b, annee }));
              }}
            />
          </label>
          <button type="button" className="secondaire" onClick={() => void ouvrirModele()}>
            Ouvrir un modèle…
          </button>
        </div>
        {message !== null && <p className="note">{message}</p>}
      </section>

      <section>
        <h2>Sources</h2>
        {brouillon.sources.map((source) => (
          <CarteSource
            key={source.id}
            source={source}
            onBrouillon={onBrouillon}
            onChoisirFichier={() => void choisirSource(source.id)}
          />
        ))}
        <button type="button" onClick={() => void choisirSource()}>
          Ajouter une source…
        </button>
      </section>

      <section>
        <h2>Gabarit</h2>
        <div className="ligne-champs">
          <span className={brouillon.gabarit ? 'chemin' : 'chemin vide'}>
            {brouillon.gabarit ? nomDeFichier(brouillon.gabarit.chemin) : 'Aucun gabarit'}
          </span>
          <button type="button" className="secondaire" onClick={() => void choisirGabarit()}>
            Choisir le gabarit…
          </button>
        </div>
        {brouillon.gabarit !== null && ongletCourant !== undefined && (
          <>
            <div className="onglets-gabarit" role="tablist">
              {brouillon.gabarit.onglets.map((o) => (
                <button
                  key={o.nom}
                  type="button"
                  role="tab"
                  aria-selected={o.nom === ongletCourant.nom}
                  className={o.nom === ongletCourant.nom ? 'onglet actif' : 'onglet'}
                  onClick={() => {
                    setOngletAffiche(o.nom);
                  }}
                >
                  {o.nom}
                </button>
              ))}
            </div>
            {visee !== null && (
              <p className="note">
                Cliquez sur une cellule pour « {LIBELLES_CHAMPS[visee.champ]} » de la règle «{' '}
                {brouillon.regles[visee.regle]?.id} ».
              </p>
            )}
            <GrilleGabarit onglet={ongletCourant} enVisee={visee !== null} onClic={clicGabarit} />
            <p className="discret">
              Les cellules grisées contiennent une formule : aucune règle ne doit y écrire.
            </p>
          </>
        )}
      </section>

      <section>
        <h2>Règles</h2>
        {brouillon.regles.map((regle, index) => (
          <CarteRegle
            key={index}
            regle={regle}
            brouillon={brouillon}
            actif={visee?.regle === index ? visee.champ : null}
            onRegle={(nouvelle) => {
              onBrouillon((b) => majRegle(b, index, nouvelle));
            }}
            onRetirer={() => {
              setVisee(null);
              onBrouillon((b) => retirerRegle(b, index));
            }}
            onViser={(champ) => {
              viser(index, champ);
            }}
          />
        ))}
        <div className="actions">
          {TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className="secondaire"
              onClick={() => {
                onBrouillon((b) => ajouterRegle(b, type));
              }}
            >
              + {LIBELLES_TYPES[type].titre}
            </button>
          ))}
        </div>
      </section>

      <section aria-live="polite">
        <h2>Vérification</h2>
        {liste.length === 0 ? (
          <p className="succes">Le modèle est cohérent.</p>
        ) : (
          <ul className="avertissements">
            {liste.map((probleme, index) => (
              <li key={index}>{decrireProbleme(probleme, versModele(brouillon))}</li>
            ))}
          </ul>
        )}
        <div className="actions">
          <button type="button" disabled={liste.length > 0} onClick={() => void enregistrer()}>
            Enregistrer le modèle…
          </button>
          <button
            type="button"
            className="secondaire"
            disabled={liste.length > 0 || fichiers === null}
            onClick={() => {
              if (fichiers !== null) onRemplir({ modele: versModele(brouillon), ...fichiers });
            }}
          >
            Tester avec ces fichiers
          </button>
        </div>
      </section>
    </>
  );
}
