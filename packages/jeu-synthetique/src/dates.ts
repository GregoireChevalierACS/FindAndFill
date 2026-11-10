/** Date du calendrier au format AAAA-MM-JJ, sans fuseau horaire. */
export type DateIso = string;

const FORMAT_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function enUtc(date: DateIso): Date {
  const correspondance = FORMAT_DATE.exec(date);
  if (correspondance === null) {
    throw new RangeError(`Date invalide : ${date}`);
  }
  const [, annee, mois, jour] = correspondance;
  return new Date(Date.UTC(Number(annee), Number(mois) - 1, Number(jour)));
}

export function dateIso(annee: number, mois: number, jour: number): DateIso {
  return new Date(Date.UTC(annee, mois - 1, jour)).toISOString().slice(0, 10);
}

export function ajouterJours(date: DateIso, jours: number): DateIso {
  const resultat = enUtc(date);
  resultat.setUTCDate(resultat.getUTCDate() + jours);
  return resultat.toISOString().slice(0, 10);
}

/** Mois de 1 à 12. */
export function moisDe(date: DateIso): number {
  return enUtc(date).getUTCMonth() + 1;
}

export function anneeDe(date: DateIso): number {
  return enUtc(date).getUTCFullYear();
}

/** Date JavaScript à minuit UTC, pour les cellules Excel. */
export function versDate(date: DateIso): Date {
  return enUtc(date);
}

/** Format AAAAMMJJ du FEC. */
export function versFec(date: DateIso): string {
  return date.replaceAll('-', '');
}

/** Format JJ/MM/AAAA des exports français. */
export function versFrancais(date: DateIso): string {
  const [annee = '', mois = '', jour = ''] = date.split('-');
  return `${jour}/${mois}/${annee}`;
}

export const MOIS_COURTS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;
