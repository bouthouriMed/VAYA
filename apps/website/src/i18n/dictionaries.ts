import en from './en.json';
import fr from './fr.json';

export const locales = ['fr', 'en'] as const;
export type Locale = (typeof locales)[number];

const dictionaries = { en, fr } satisfies Record<Locale, typeof en>;

export type Dictionary = (typeof dictionaries)['en'];

export function getDictionary(locale: string): Dictionary {
  return dictionaries[(locale as Locale) in dictionaries ? (locale as Locale) : 'fr'];
}
