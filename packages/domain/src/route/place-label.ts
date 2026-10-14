// Place labels (rides.originLabel, bookings.pickupLabel, ...) are stored
// as one flat Google-formatted string. Real Tunisian addresses come back
// like "R4MF+76P، Rue 6863، Tunis, Tunisia": an Open Location Code ("Plus
// Code") — a grid reference no human reads as an address — plus Arabic
// commas (U+060C) mixed with Latin ones. Both broke the old
// comma-splitting shortener, which only knew ",": the whole Arabic-comma
// run counted as one segment, so the Plus Code reached card titles intact.
// One source for turning a stored label into readable text, shared by the
// API (cleaning labels as they're geocoded) and the app (cleaning rows
// stored before that).

/** Open Location Code alphabet (no vowels, no 0/1). A full code has 8 chars
 *  before "+", a short (locality-relative) one 4-7; 0-3 after. */
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{0,3}$/i;
const LEADING_PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{0,3}\s+/i;
const SEGMENT_SEPARATOR = /[,،]/;
const POSTAL_PREFIX = /^\d[\d\s-]*\s+/;

export function isPlusCode(text: string): boolean {
  return PLUS_CODE.test(text.trim());
}

/** The label's real segments, in order, without Plus Codes (a standalone
 *  "R4MF+76P" segment, or one prefixed to a name as "R4MF+76P Tunis"). */
export function placeLabelSegments(label: string): string[] {
  return label
    .split(SEGMENT_SEPARATOR)
    .map((s) => s.trim().replace(LEADING_PLUS_CODE, '').trim())
    .filter((s) => s.length > 0 && !isPlusCode(s));
}

/** The full address, readable: Plus Codes removed, one comma style.
 *  "R4MF+76P، Rue 6863، Tunis, Tunisia" -> "Rue 6863, Tunis, Tunisia".
 *  Returns the original when nothing readable would remain. */
export function readablePlaceLabel(label: string): string {
  const segments = placeLabelSegments(label);
  return segments.length > 0 ? segments.join(', ') : label.trim();
}

/** A compact "place, locality" title for cards: drops the trailing
 *  country (Google's formatted addresses always end with it), postal-code
 *  prefixes, and Plus Codes, then keeps the last two segments.
 *  "R4MF+76P، Rue 6863، Tunis, Tunisia" -> "Rue 6863, Tunis";
 *  "Mas de Born, 43512 Benifallet, Tarragona, Spain" -> "Benifallet, Tarragona".
 *  Every word shown is real text from the label — never invented. */
export function shortPlaceLabel(label: string): string {
  const segments = placeLabelSegments(label);
  if (segments.length === 0) return label.trim();
  if (segments.length === 1) return segments[0]!;

  const withoutCountry = segments.slice(0, -1);
  const cleaned = withoutCountry.map((s) => s.replace(POSTAL_PREFIX, '').trim()).filter(Boolean);
  const kept = cleaned.length > 0 ? cleaned : withoutCountry;
  return kept.slice(-2).join(', ');
}
