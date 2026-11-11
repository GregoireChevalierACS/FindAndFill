import { useState } from 'react';
import { brouillonVide, type Brouillon } from './brouillon.js';
import { Editeur } from './Editeur.js';
import { Remplissage, SELECTION_VIDE, type Selection } from './Remplissage.js';

type Vue = 'remplir' | 'modele';

export function App() {
  const [vue, setVue] = useState<Vue>('remplir');
  // Le brouillon et la sélection survivent au changement d'onglet.
  const [brouillon, setBrouillon] = useState<Brouillon>(() =>
    brouillonVide(new Date().getFullYear()),
  );
  const [remplir, setRemplir] = useState<{ selection: Selection; version: number }>({
    selection: SELECTION_VIDE,
    version: 0,
  });

  return (
    <main>
      <header>
        <h1>FindAndFill</h1>
        <p className="discret">
          Remplir un reporting Excel à partir des exports comptables, sans ressaisie.
        </p>
        <nav className="onglets-gabarit" role="tablist" aria-label="Écrans">
          <button
            type="button"
            role="tab"
            aria-selected={vue === 'remplir'}
            className={vue === 'remplir' ? 'onglet actif' : 'onglet'}
            onClick={() => {
              setVue('remplir');
            }}
          >
            Remplir
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={vue === 'modele'}
            className={vue === 'modele' ? 'onglet actif' : 'onglet'}
            onClick={() => {
              setVue('modele');
            }}
          >
            Modèle
          </button>
        </nav>
      </header>
      <div hidden={vue !== 'remplir'}>
        <Remplissage key={remplir.version} initiale={remplir.selection} />
      </div>
      <div hidden={vue !== 'modele'}>
        <Editeur
          brouillon={brouillon}
          onBrouillon={setBrouillon}
          onRemplir={(selection) => {
            setRemplir((r) => ({ selection, version: r.version + 1 }));
            setVue('remplir');
          }}
        />
      </div>
    </main>
  );
}
