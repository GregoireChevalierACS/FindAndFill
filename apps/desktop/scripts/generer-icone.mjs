// Génère ressources/icon.png (512 × 512) : une feuille de calcul dont des cellules se remplissent.
// Dessin vectoriel simple, lissé par suréchantillonnage, encodé en PNG sans dépendance.
// Usage : node scripts/generer-icone.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const TAILLE = 512;
const ECHANTILLONS = 4;

const FOND = [31, 95, 191];
const FEUILLE = [255, 255, 255];
const TRAIT = [196, 210, 232];
const ENTETE = [214, 226, 245];
const REMPLI = [46, 160, 103];

/** Rectangle aux coins arrondis : vrai si (x, y) est à l'intérieur. */
function dansRectangleArrondi(x, y, x0, y0, x1, y1, rayon) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rayon), x1 - rayon);
  const cy = Math.min(Math.max(y, y0 + rayon), y1 - rayon);
  return (x - cx) ** 2 + (y - cy) ** 2 <= rayon ** 2;
}

// Feuille : 4 colonnes × 5 lignes ; la première ligne est l'en-tête, quelques cellules sont remplies.
const FEUILLE_X0 = 104;
const FEUILLE_Y0 = 112;
const FEUILLE_X1 = 408;
const FEUILLE_Y1 = 400;
const COLONNES = 4;
const LIGNES = 5;
const LARGEUR = (FEUILLE_X1 - FEUILLE_X0) / COLONNES;
const HAUTEUR = (FEUILLE_Y1 - FEUILLE_Y0) / LIGNES;
const REMPLIES = new Set(['1,1', '2,2', '3,2', '1,3', '3,3', '2,4']);

function couleur(x, y) {
  if (!dansRectangleArrondi(x, y, 16, 16, TAILLE - 16, TAILLE - 16, 96)) return null;
  if (!dansRectangleArrondi(x, y, FEUILLE_X0, FEUILLE_Y0, FEUILLE_X1, FEUILLE_Y1, 18)) return FOND;
  const colonne = Math.min(COLONNES - 1, Math.floor((x - FEUILLE_X0) / LARGEUR));
  const ligne = Math.min(LIGNES - 1, Math.floor((y - FEUILLE_Y0) / HAUTEUR));
  const dx = (x - FEUILLE_X0) % LARGEUR;
  const dy = (y - FEUILLE_Y0) % HAUTEUR;
  const surTrait = (dx < 3 && colonne > 0) || (dy < 3 && ligne > 0);
  if (surTrait) return TRAIT;
  if (ligne === 0) return ENTETE;
  if (REMPLIES.has(`${colonne},${ligne}`)) {
    const marge = 12;
    if (dx > marge && dx < LARGEUR - marge && dy > marge && dy < HAUTEUR - marge) return REMPLI;
  }
  return FEUILLE;
}

const pixels = Buffer.alloc(TAILLE * (TAILLE * 4 + 1));
for (let y = 0; y < TAILLE; y++) {
  const debut = y * (TAILLE * 4 + 1);
  pixels[debut] = 0; // filtre PNG « aucun »
  for (let x = 0; x < TAILLE; x++) {
    let r = 0;
    let v = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < ECHANTILLONS; sy++) {
      for (let sx = 0; sx < ECHANTILLONS; sx++) {
        const c = couleur(x + (sx + 0.5) / ECHANTILLONS, y + (sy + 0.5) / ECHANTILLONS);
        if (c !== null) {
          r += c[0];
          v += c[1];
          b += c[2];
          a += 1;
        }
      }
    }
    const i = debut + 1 + x * 4;
    pixels[i] = a === 0 ? 0 : Math.round(r / a);
    pixels[i + 1] = a === 0 ? 0 : Math.round(v / a);
    pixels[i + 2] = a === 0 ? 0 : Math.round(b / a);
    pixels[i + 3] = Math.round((255 * a) / ECHANTILLONS ** 2);
  }
}

const TABLE_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(octets) {
  let c = 0xffffffff;
  for (const octet of octets) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const typeEtDonnees = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeEtDonnees));
  return Buffer.concat([longueur, typeEtDonnees, crc]);
}

const entete = Buffer.alloc(13);
entete.writeUInt32BE(TAILLE, 0);
entete.writeUInt32BE(TAILLE, 4);
entete[8] = 8; // 8 bits par canal
entete[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  bloc('IHDR', entete),
  bloc('IDAT', deflateSync(pixels, { level: 9 })),
  bloc('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('../ressources/icon.png', import.meta.url), png);
console.log(`ressources/icon.png écrit (${png.length} octets)`);
