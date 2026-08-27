/** Side-effect-only import. Some Hermes builds implement `Intl.NumberFormat`/
 *  `Intl.DateTimeFormat` (used throughout `localeFormat.ts` without issue)
 *  but leave `Intl.RelativeTimeFormat` — and the locale primitives it
 *  depends on internally (`Intl.getCanonicalLocales`, `Intl.Locale`,
 *  `Intl.PluralRules`) — undefined. Constructing `new
 *  Intl.RelativeTimeFormat(...)` against an undefined global throws
 *  "Cannot read property 'prototype' of undefined", which is exactly what
 *  crashed `formatRelativeTime` the first time it ever ran on-device. The
 *  chain below force-installs the full real (CLDR-backed) polyfill stack for
 *  VAYA's 3 supported locales, in dependency order — each `-force` module
 *  assumes the one imported before it already exists. */
import '@formatjs/intl-getcanonicallocales/polyfill-force.js';
import '@formatjs/intl-locale/polyfill-force.js';

import '@formatjs/intl-pluralrules/polyfill-force.js';
import '@formatjs/intl-pluralrules/locale-data/en';
import '@formatjs/intl-pluralrules/locale-data/fr';
import '@formatjs/intl-pluralrules/locale-data/ar';

import '@formatjs/intl-relativetimeformat/polyfill-force.js';
import '@formatjs/intl-relativetimeformat/locale-data/en';
import '@formatjs/intl-relativetimeformat/locale-data/fr';
import '@formatjs/intl-relativetimeformat/locale-data/ar';
