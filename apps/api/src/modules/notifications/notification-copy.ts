import { placeLabelSegments, shortPlaceLabel, type NotificationEventType } from '@vaya/domain';

/**
 * What a push notification says — pure, unit-tested, no I/O.
 *
 * A notification is read on a lock screen, often without opening the app, so
 * each one names who, which trip, when and where, and says what to do next —
 * never a generic "you have a new notification" or "cancelled by the other
 * party". Written in the recipient's own language (users.locale), and in
 * gender-neutral wording: the copy never knows whether "Mehdi" or "Dinara"
 * is driving. Every field of the context is optional; a missing detail
 * drops out of the sentence instead of producing a broken one.
 */

export type NotificationLocale = 'fr' | 'en' | 'ar';

export interface NotificationContext {
  /** The recipient's side of the booking, when it's about one. */
  role?: 'driver' | 'rider';
  /** First name of the other person involved (rider, driver, sender, rater). */
  otherName?: string;
  /** Short route, e.g. "Tunis → Sousse". */
  route?: string;
  /** Short destination, e.g. "Sousse". */
  destination?: string;
  departureAt?: Date;
  /** Short meeting point for the rider, e.g. "La Marsa, Plage". */
  meetingPoint?: string;
  /** e.g. "Volkswagen Golf 7, Blanc · 198 TU 3301". */
  vehicle?: string;
  seats?: number;
  pricePerSeat?: number;
  seatsAvailable?: number;
  expiresAt?: Date;
  messagePreview?: string;
}

export interface NotificationText {
  title: string;
  body: string;
}

const TZ = 'Africa/Tunis';
const INTL_TAG: Record<NotificationLocale, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };
const MESSAGE_PREVIEW_MAX = 120;

function dayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** 24-hour clock in Tunis time ("19:14"). */
export function clock(d: Date, locale: NotificationLocale): string {
  return new Intl.DateTimeFormat(INTL_TAG[locale], {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    numberingSystem: 'latn',
  }).format(d);
}

/** "aujourd'hui à 19:14", "demain à 08:30", "jeu. 16 oct. à 19:14". */
export function when(d: Date, locale: NotificationLocale, now: Date = new Date()): string {
  const time = clock(d, locale);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const words = WORDS[locale];
  if (dayKey(d) === dayKey(now)) return `${words.today} ${words.at} ${time}`;
  if (dayKey(d) === dayKey(tomorrow)) return `${words.tomorrow} ${words.at} ${time}`;
  const day = new Intl.DateTimeFormat(INTL_TAG[locale], {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    numberingSystem: 'latn',
  }).format(d);
  return `${day} ${words.at} ${time}`;
}

/** A deadline: just the clock when it's today ("18:30"), otherwise with its
 *  day ("demain à 08:00") — a bare "12:00" for a deadline days away reads
 *  as today. */
export function deadline(d: Date, locale: NotificationLocale, now: Date = new Date()): string {
  return dayKey(d) === dayKey(now) ? clock(d, locale) : when(d, locale, now);
}

const WORDS: Record<NotificationLocale, { today: string; tomorrow: string; at: string }> = {
  fr: { today: "aujourd'hui", tomorrow: 'demain', at: 'à' },
  en: { today: 'today', tomorrow: 'tomorrow', at: 'at' },
  ar: { today: 'اليوم', tomorrow: 'غدًا', at: 'على الساعة' },
};

export function firstName(fullName: string | null | undefined): string | undefined {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : undefined;
}

/** The town/district of a stored label ("Rue 6863, Tunis, Tunisia" ->
 *  "Tunis"): the last segment before the country, without postal code. */
function locality(label: string): string {
  const segments = placeLabelSegments(label);
  if (segments.length <= 1) return segments[0] ?? label.trim();
  const withoutCountry = segments
    .slice(0, -1)
    .map((s) => s.replace(/^\d[\d\s-]*\s+/, '').trim())
    .filter(Boolean);
  return withoutCountry[withoutCountry.length - 1] ?? segments[0]!;
}

/** "Tunis → Sousse": a lock-screen title needs towns, not addresses (the
 *  exact meeting point goes in the body). Two ends in the same town would
 *  read "Tunis → Tunis", so those fall back to the more precise short
 *  labels. */
export function routeLabel(origin: string, destination: string): string {
  const from = locality(origin);
  const to = locality(destination);
  return from === to ? `${shortPlaceLabel(origin)} → ${shortPlaceLabel(destination)}` : `${from} → ${to}`;
}

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MESSAGE_PREVIEW_MAX ? `${flat.slice(0, MESSAGE_PREVIEW_MAX - 1)}…` : flat;
}

/** Joins the sentence parts that exist, so a missing detail never leaves a
 *  dangling "à ." or ", ,". */
function join(parts: (string | false | 0 | undefined | null)[], sep = ' · '): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(sep);
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

type Payload = Record<string, unknown>;
type Builder = (c: NotificationContext, p: Payload, l: NotificationLocale, now: Date) => NotificationText;

const DETOUR_WORDS: Record<NotificationLocale, { onRoute: string; detour: (min: number) => string }> = {
  fr: { onRoute: 'Sur votre trajet', detour: (m) => `+${m} min de détour` },
  en: { onRoute: 'On your route', detour: (m) => `+${m} min detour` },
  ar: { onRoute: 'على طريقك', detour: (m) => `+${m} د انعطاف` },
};

/** "4,5 DT" (fr/ar) / "4.5 DT" (en) — no trailing zeros. */
function dinars(value: number, l: NotificationLocale): string {
  const rounded = String(Math.round(value * 100) / 100);
  return `${l === 'en' ? rounded : rounded.replace('.', ',')} DT`;
}

/**
 * Phase 14 (docs/roadmap/phase-14-intelligent-pickup-engine.md): what a
 * driver needs to decide on a seat request from the lock screen — where
 * the passenger boards and alights, the extra driving, what it pays.
 * "Sidi Hassine → El Mourouj · +3 min de détour · 4,5 DT". Every value
 * comes from the booking; a missing one is left out, never guessed.
 */
export function requestFacts(p: Payload, l: NotificationLocale): string {
  const from = str(p.originLabel);
  const to = str(p.destinationLabel);
  const leg = from && to ? `${shortPlaceLabel(from)} → ${shortPlaceLabel(to)}` : undefined;
  const extra = num(p.detourExtraSeconds);
  const minutes = extra === undefined ? undefined : Math.round(extra / 60);
  const detour = minutes === undefined ? undefined : minutes < 1 ? DETOUR_WORDS[l].onRoute : DETOUR_WORDS[l].detour(minutes);
  const total = num(p.contributionTotal);
  return join([leg, detour, total !== undefined && dinars(total, l)]);
}

// ---------------------------------------------------------------------------
// French
// ---------------------------------------------------------------------------

const seatsFr = (n: number) => `${n} place${n > 1 ? 's' : ''}`;

const FR: Partial<Record<NotificationEventType, Builder>> = {
  booking_requested: (c, p, l, now) => ({
    title: c.route ? `Nouvelle demande · ${c.route}` : 'Nouvelle demande de réservation',
    body: join(
      [
        `${c.otherName ?? str(p.riderName) ?? 'Un passager'} demande ${seatsFr(c.seats ?? 1)}${c.departureAt ? ` pour ${when(c.departureAt, l, now)}` : ''}.`,
        requestFacts(p, l) && `${requestFacts(p, l)}.`,
        str(p.requestMessage) && `« ${str(p.requestMessage)} »`,
        c.expiresAt && `Répondez avant ${deadline(c.expiresAt, l, now)}.`,
      ],
      ' ',
    ),
  }),
  booking_deadline_approaching: (c, _p, l, now) => ({
    title: `${c.otherName ?? 'Un passager'} attend votre réponse`,
    body: join(
      [
        `Demande pour ${join([c.route, c.departureAt && when(c.departureAt, l, now)], ', ') || 'votre trajet'}.`,
        c.expiresAt && `Réponse attendue avant ${deadline(c.expiresAt, l, now)}.`,
      ],
      ' ',
    ),
  }),
  booking_accepted: (c, p, l, now) => ({
    title: `${c.otherName ?? str(p.driverName) ?? 'Le conducteur'} a accepté votre demande`,
    body: join(
      [
        join([c.route, c.departureAt && when(c.departureAt, l, now)], ', ') + '.',
        c.meetingPoint && `Rendez-vous : ${c.meetingPoint}.`,
      ],
      ' ',
    ),
  }),
  booking_declined: (c, p, l, now) => ({
    title: 'Demande non acceptée',
    body: `${c.otherName ?? str(p.driverName) ?? 'Le conducteur'} ne peut pas vous prendre${c.route ? ` pour ${c.route}` : ''}${c.departureAt ? `, ${when(c.departureAt, l, now)}` : ''}. D'autres trajets sont peut-être disponibles.`,
  }),
  booking_cancelled: (c, _p, l, now) =>
    c.role === 'driver'
      ? {
          title: `${c.otherName ?? 'Un passager'} a annulé sa réservation`,
          body: join([c.route, c.departureAt && when(c.departureAt, l, now), c.seats && `${seatsFr(c.seats)} à nouveau disponible${c.seats > 1 ? 's' : ''}`]),
        }
      : {
          title: `${c.otherName ?? 'Le conducteur'} a annulé votre trajet`,
          body: `${join([c.route, c.departureAt && when(c.departureAt, l, now)], ', ') || 'Votre trajet'}. Cherchez un autre trajet dans VAYA.`,
        },
  booking_sibling_cancelled: (c, _p, l, now) => ({
    title: 'Demande retirée',
    body: `Votre demande${c.route ? ` pour ${c.route}` : ''}${c.departureAt ? `, ${when(c.departureAt, l, now)},` : ''} a été retirée automatiquement.`,
  }),
  booking_no_show_reported: (c, _p, l, now) => ({
    title: 'Absence signalée',
    body: `${c.otherName ?? "L'autre personne"} a signalé votre absence${c.route ? ` pour ${c.route}` : ''}${c.departureAt ? `, ${when(c.departureAt, l, now)}` : ''}. Ouvrez la réservation pour en savoir plus.`,
  }),
  message_received: (c) => ({
    title: c.otherName ? `${c.otherName}${c.route ? ` · ${c.route}` : ''}` : 'Nouveau message',
    body: c.messagePreview ?? `Nouveau message${c.route ? ` à propos de ${c.route}` : ''}.`,
  }),
  trip_driver_approaching: (c) => ({
    title: `${c.otherName ?? 'Votre conducteur'} est en route`,
    body: join([c.meetingPoint ? `Rendez-vous à ${c.meetingPoint}. Préparez-vous.` : 'Préparez-vous pour le départ.', c.vehicle], ' '),
  }),
  trip_pickup_arrived: (c) => ({
    title: `${c.otherName ?? 'Votre conducteur'} vous attend`,
    body: join([c.meetingPoint ? `Au point de rendez-vous : ${c.meetingPoint}.` : 'Au point de rendez-vous.', c.vehicle], ' '),
  }),
  trip_passenger_onboard: (c) => ({
    title: 'Bon voyage',
    body: c.destination ? `En route vers ${c.destination}. Suivez le trajet en direct.` : 'Suivez le trajet en direct.',
  }),
  trip_active: (c) => ({
    title: 'Votre trajet a commencé',
    body: `${join([c.route, c.otherName && `avec ${c.otherName}`], ' ') || 'Votre trajet'}. Suivez-le en direct.`,
  }),
  trip_route_deviation: (c) => ({
    title: 'Itinéraire modifié',
    body: `${c.otherName ?? 'Le conducteur'} a pris un autre chemin. L'heure d'arrivée est recalculée.`,
  }),
  trip_eta_changed: (c, p, l, now) => {
    const eta = num(p.etaMinutes);
    return eta !== undefined
      ? {
          title: `Arrivée vers ${clock(new Date(now.getTime() + eta * 60_000), l)}`,
          body: `Nouvelle estimation${c.destination ? ` pour ${c.destination}` : ''} : environ ${Math.round(eta)} min.`,
        }
      : { title: "Heure d'arrivée mise à jour", body: `L'arrivée estimée${c.destination ? ` à ${c.destination}` : ''} a changé.` };
  },
  trip_tracking_unavailable: (c) => ({
    title: 'Suivi en direct interrompu',
    body: `Le trajet continue normalement. La position${c.otherName ? ` de ${c.otherName}` : ''} se mettra à jour dès que possible.`,
  }),
  trip_arriving: (c) => ({
    title: c.destination ? `Bientôt à ${c.destination}` : 'Bientôt arrivé',
    body: "Arrivée dans quelques minutes. N'oubliez pas vos affaires.",
  }),
  trip_completed: (c, p) => ({
    title: 'Comment s’est passé le trajet ?',
    body: `Notez ${c.otherName ?? str(p.driverName) ?? str(p.riderName) ?? 'votre trajet'}${c.route ? ` (${c.route})` : ''}. Ça prend quelques secondes.`,
  }),
  trip_completion_reminder: (c) => ({
    title: 'Trajet terminé ?',
    body: `Confirmez la fin${c.route ? ` de ${c.route}` : ' du trajet'} pour pouvoir le noter.`,
  }),
  rating_received: (c, p) => {
    const stars = num(p.stars);
    return {
      title: stars !== undefined ? `Nouvel avis : ${stars.toFixed(1)}/5` : 'Nouvel avis reçu',
      body: `${str(p.raterName) ?? c.otherName ?? 'Un membre'} vous a noté${c.route ? ` après ${c.route}` : ''}.`,
    };
  },
  recurring_pattern_detected: (c) => ({
    title: 'Un trajet régulier ?',
    body: `Vous faites souvent ${c.route ?? 'ce trajet'}. Activez-le pour recevoir les nouveaux trajets.`,
  }),
  recurring_proactive_match: (c, _p, l, now) => ({
    title: c.route ? `Nouveau trajet ${c.route}` : 'Nouveau trajet correspondant',
    body: join([
      `${c.otherName ?? 'Un conducteur'} part${c.departureAt ? ` ${when(c.departureAt, l, now)}` : ''}`,
      c.seatsAvailable && `${seatsFr(c.seatsAvailable)}`,
      c.pricePerSeat !== undefined && `${c.pricePerSeat} DT la place`,
    ]),
  }),
  demand_signal_matched: (c, _p, l, now) => ({
    title: c.route ? `Trajet disponible · ${c.route}` : 'Un trajet correspond à votre recherche',
    body: join([c.departureAt && when(c.departureAt, l, now), c.pricePerSeat !== undefined && `${c.pricePerSeat} DT la place`, 'Réservez avant qu’il soit complet']),
  }),
  verification_submitted: () => ({
    title: 'Documents reçus',
    body: 'Nous vérifions votre profil conducteur. Nous vous préviendrons dès que c’est fait.',
  }),
  verification_approved: (_c, p) => ({
    title: 'Profil conducteur vérifié',
    body: (num(p.publishedRideCount) ?? 0) > 0 ? 'Votre trajet en attente est maintenant publié.' : 'Vous pouvez publier vos trajets.',
  }),
  verification_declined: (_c, p) => ({
    title: 'Vérification refusée',
    body: str(p.declineMessage) ?? 'Ouvrez VAYA pour voir le motif.',
  }),
  verification_resubmission_required: (_c, p) => ({
    title: 'Un document à mettre à jour',
    body: str(p.declineMessage) ?? 'Ouvrez VAYA pour voir quoi corriger.',
  }),
};

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

const seatsEn = (n: number) => `${n} seat${n > 1 ? 's' : ''}`;

const EN: Partial<Record<NotificationEventType, Builder>> = {
  booking_requested: (c, p, l, now) => ({
    title: c.route ? `New request · ${c.route}` : 'New booking request',
    body: join(
      [
        `${c.otherName ?? str(p.riderName) ?? 'A passenger'} wants ${seatsEn(c.seats ?? 1)}${c.departureAt ? ` for ${when(c.departureAt, l, now)}` : ''}.`,
        requestFacts(p, l) && `${requestFacts(p, l)}.`,
        str(p.requestMessage) && `“${str(p.requestMessage)}”`,
        c.expiresAt && `Reply before ${deadline(c.expiresAt, l, now)}.`,
      ],
      ' ',
    ),
  }),
  booking_deadline_approaching: (c, _p, l, now) => ({
    title: `${c.otherName ?? 'A passenger'} is waiting for your reply`,
    body: join(
      [
        `Request for ${join([c.route, c.departureAt && when(c.departureAt, l, now)], ', ') || 'your ride'}.`,
        c.expiresAt && `Reply needed before ${deadline(c.expiresAt, l, now)}.`,
      ],
      ' ',
    ),
  }),
  booking_accepted: (c, p, l, now) => ({
    title: `${c.otherName ?? str(p.driverName) ?? 'The driver'} accepted your request`,
    body: join([join([c.route, c.departureAt && when(c.departureAt, l, now)], ', ') + '.', c.meetingPoint && `Meet at ${c.meetingPoint}.`], ' '),
  }),
  booking_declined: (c, p, l, now) => ({
    title: 'Request not accepted',
    body: `${c.otherName ?? str(p.driverName) ?? 'The driver'} can't take you${c.route ? ` on ${c.route}` : ''}${c.departureAt ? `, ${when(c.departureAt, l, now)}` : ''}. Other rides may be available.`,
  }),
  booking_cancelled: (c, _p, l, now) =>
    c.role === 'driver'
      ? {
          title: `${c.otherName ?? 'A passenger'} cancelled their booking`,
          body: join([c.route, c.departureAt && when(c.departureAt, l, now), c.seats && `${seatsEn(c.seats)} free again`]),
        }
      : {
          title: `${c.otherName ?? 'The driver'} cancelled your ride`,
          body: `${join([c.route, c.departureAt && when(c.departureAt, l, now)], ', ') || 'Your ride'}. Find another ride in VAYA.`,
        },
  booking_sibling_cancelled: (c, _p, l, now) => ({
    title: 'Request withdrawn',
    body: `Your request${c.route ? ` for ${c.route}` : ''}${c.departureAt ? `, ${when(c.departureAt, l, now)},` : ''} was withdrawn automatically.`,
  }),
  booking_no_show_reported: (c, _p, l, now) => ({
    title: 'No-show reported',
    body: `${c.otherName ?? 'The other person'} reported you as absent${c.route ? ` on ${c.route}` : ''}${c.departureAt ? `, ${when(c.departureAt, l, now)}` : ''}. Open the booking for details.`,
  }),
  message_received: (c) => ({
    title: c.otherName ? `${c.otherName}${c.route ? ` · ${c.route}` : ''}` : 'New message',
    body: c.messagePreview ?? `New message${c.route ? ` about ${c.route}` : ''}.`,
  }),
  trip_driver_approaching: (c) => ({
    title: `${c.otherName ?? 'Your driver'} is on the way`,
    body: join([c.meetingPoint ? `Meet at ${c.meetingPoint}. Get ready.` : 'Get ready to leave.', c.vehicle], ' '),
  }),
  trip_pickup_arrived: (c) => ({
    title: `${c.otherName ?? 'Your driver'} is waiting for you`,
    body: join([c.meetingPoint ? `At the meeting point: ${c.meetingPoint}.` : 'At the meeting point.', c.vehicle], ' '),
  }),
  trip_passenger_onboard: (c) => ({
    title: 'Enjoy the ride',
    body: c.destination ? `On the way to ${c.destination}. Follow the trip live.` : 'Follow the trip live.',
  }),
  trip_active: (c) => ({
    title: 'Your ride has started',
    body: `${join([c.route, c.otherName && `with ${c.otherName}`], ' ') || 'Your ride'}. Follow it live.`,
  }),
  trip_route_deviation: (c) => ({
    title: 'Route changed',
    body: `${c.otherName ?? 'The driver'} took a different way. The arrival time is being recalculated.`,
  }),
  trip_eta_changed: (c, p, l, now) => {
    const eta = num(p.etaMinutes);
    return eta !== undefined
      ? {
          title: `Arriving around ${clock(new Date(now.getTime() + eta * 60_000), l)}`,
          body: `New estimate${c.destination ? ` for ${c.destination}` : ''}: about ${Math.round(eta)} min.`,
        }
      : { title: 'Arrival time updated', body: `The estimated arrival${c.destination ? ` in ${c.destination}` : ''} has changed.` };
  },
  trip_tracking_unavailable: (c) => ({
    title: 'Live tracking paused',
    body: `The ride continues as normal. ${c.otherName ? `${c.otherName}'s` : 'The'} position will update as soon as possible.`,
  }),
  trip_arriving: (c) => ({
    title: c.destination ? `Almost in ${c.destination}` : 'Almost there',
    body: 'Arriving in a few minutes. Don’t forget your things.',
  }),
  trip_completed: (c, p) => ({
    title: 'How was the ride?',
    body: `Rate ${c.otherName ?? str(p.driverName) ?? str(p.riderName) ?? 'your ride'}${c.route ? ` (${c.route})` : ''}. It takes a few seconds.`,
  }),
  trip_completion_reminder: (c) => ({
    title: 'Ride finished?',
    body: `Confirm the end of ${c.route ?? 'the ride'} so you can rate it.`,
  }),
  rating_received: (c, p) => {
    const stars = num(p.stars);
    return {
      title: stars !== undefined ? `New review: ${stars.toFixed(1)}/5` : 'New review',
      body: `${str(p.raterName) ?? c.otherName ?? 'A member'} rated you${c.route ? ` after ${c.route}` : ''}.`,
    };
  },
  recurring_pattern_detected: (c) => ({
    title: 'A regular trip?',
    body: `You often travel ${c.route ?? 'this route'}. Turn it on to hear about new rides.`,
  }),
  recurring_proactive_match: (c, _p, l, now) => ({
    title: c.route ? `New ride · ${c.route}` : 'New matching ride',
    body: join([
      `${c.otherName ?? 'A driver'} leaves${c.departureAt ? ` ${when(c.departureAt, l, now)}` : ''}`,
      c.seatsAvailable && seatsEn(c.seatsAvailable),
      c.pricePerSeat !== undefined && `${c.pricePerSeat} DT per seat`,
    ]),
  }),
  demand_signal_matched: (c, _p, l, now) => ({
    title: c.route ? `Ride available · ${c.route}` : 'A ride matches your search',
    body: join([c.departureAt && when(c.departureAt, l, now), c.pricePerSeat !== undefined && `${c.pricePerSeat} DT per seat`, 'Book before it fills up']),
  }),
  verification_submitted: () => ({
    title: 'Documents received',
    body: 'We’re checking your driver profile and will let you know as soon as it’s done.',
  }),
  verification_approved: (_c, p) => ({
    title: 'Driver profile verified',
    body: (num(p.publishedRideCount) ?? 0) > 0 ? 'Your pending ride is now published.' : 'You can now publish rides.',
  }),
  verification_declined: (_c, p) => ({
    title: 'Verification declined',
    body: str(p.declineMessage) ?? 'Open VAYA to see why.',
  }),
  verification_resubmission_required: (_c, p) => ({
    title: 'A document needs updating',
    body: str(p.declineMessage) ?? 'Open VAYA to see what to fix.',
  }),
};

// ---------------------------------------------------------------------------
// Arabic
// ---------------------------------------------------------------------------

const seatsAr = (n: number) => (n === 1 ? 'مقعد واحد' : n === 2 ? 'مقعدان' : n <= 10 ? `${n} مقاعد` : `${n} مقعدًا`);

const AR: Partial<Record<NotificationEventType, Builder>> = {
  booking_requested: (c, p, l, now) => ({
    title: c.route ? `طلب جديد · ${c.route}` : 'طلب حجز جديد',
    body: join(
      [
        `${c.otherName ?? str(p.riderName) ?? 'راكب'} يطلب ${seatsAr(c.seats ?? 1)}${c.departureAt ? ` ${when(c.departureAt, l, now)}` : ''}.`,
        requestFacts(p, l) && `${requestFacts(p, l)}.`,
        str(p.requestMessage) && `«${str(p.requestMessage)}»`,
        c.expiresAt && `ردّ قبل ${deadline(c.expiresAt, l, now)}.`,
      ],
      ' ',
    ),
  }),
  booking_deadline_approaching: (c, _p, l, now) => ({
    title: `${c.otherName ?? 'راكب'} ينتظر ردّك`,
    body: join(
      [
        `طلب لرحلة ${join([c.route, c.departureAt && when(c.departureAt, l, now)], '، ') || 'رحلتك'}.`,
        c.expiresAt && `الرد مطلوب قبل ${deadline(c.expiresAt, l, now)}.`,
      ],
      ' ',
    ),
  }),
  booking_accepted: (c, p, l, now) => ({
    title: `${c.otherName ?? str(p.driverName) ?? 'السائق'} قبل طلبك`,
    body: join([join([c.route, c.departureAt && when(c.departureAt, l, now)], '، ') + '.', c.meetingPoint && `نقطة الالتقاء: ${c.meetingPoint}.`], ' '),
  }),
  booking_declined: (c, p, l, now) => ({
    title: 'لم يُقبل الطلب',
    body: `${c.otherName ?? str(p.driverName) ?? 'السائق'} لا يستطيع أخذك${c.route ? ` في رحلة ${c.route}` : ''}${c.departureAt ? `، ${when(c.departureAt, l, now)}` : ''}. قد تتوفر رحلات أخرى.`,
  }),
  booking_cancelled: (c, _p, l, now) =>
    c.role === 'driver'
      ? {
          title: `${c.otherName ?? 'راكب'} ألغى حجزه`,
          body: join([c.route, c.departureAt && when(c.departureAt, l, now), c.seats && `${seatsAr(c.seats)} متاح من جديد`]),
        }
      : {
          title: `${c.otherName ?? 'السائق'} ألغى رحلتك`,
          body: `${join([c.route, c.departureAt && when(c.departureAt, l, now)], '، ') || 'رحلتك'}. ابحث عن رحلة أخرى في VAYA.`,
        },
  booking_sibling_cancelled: (c, _p, l, now) => ({
    title: 'سُحب الطلب',
    body: `سُحب طلبك${c.route ? ` لرحلة ${c.route}` : ''}${c.departureAt ? `، ${when(c.departureAt, l, now)}،` : ''} تلقائيًا.`,
  }),
  booking_no_show_reported: (c, _p, l, now) => ({
    title: 'تم الإبلاغ عن غياب',
    body: `${c.otherName ?? 'الطرف الآخر'} أبلغ عن غيابك${c.route ? ` في رحلة ${c.route}` : ''}${c.departureAt ? `، ${when(c.departureAt, l, now)}` : ''}. افتح الحجز لمزيد من التفاصيل.`,
  }),
  message_received: (c) => ({
    title: c.otherName ? `${c.otherName}${c.route ? ` · ${c.route}` : ''}` : 'رسالة جديدة',
    body: c.messagePreview ?? `رسالة جديدة${c.route ? ` بخصوص ${c.route}` : ''}.`,
  }),
  trip_driver_approaching: (c) => ({
    title: `${c.otherName ?? 'سائقك'} في الطريق`,
    body: join([c.meetingPoint ? `الالتقاء في ${c.meetingPoint}. استعد.` : 'استعد للانطلاق.', c.vehicle], ' '),
  }),
  trip_pickup_arrived: (c) => ({
    title: `${c.otherName ?? 'سائقك'} في انتظارك`,
    body: join([c.meetingPoint ? `في نقطة الالتقاء: ${c.meetingPoint}.` : 'في نقطة الالتقاء.', c.vehicle], ' '),
  }),
  trip_passenger_onboard: (c) => ({
    title: 'رحلة سعيدة',
    body: c.destination ? `في الطريق إلى ${c.destination}. تابع الرحلة مباشرة.` : 'تابع الرحلة مباشرة.',
  }),
  trip_active: (c) => ({
    title: 'بدأت رحلتك',
    body: `${join([c.route, c.otherName && `مع ${c.otherName}`], ' ') || 'رحلتك'}. تابعها مباشرة.`,
  }),
  trip_route_deviation: (c) => ({
    title: 'تغيّر المسار',
    body: `${c.otherName ?? 'السائق'} سلك طريقًا آخر. يُعاد حساب وقت الوصول.`,
  }),
  trip_eta_changed: (c, p, l, now) => {
    const eta = num(p.etaMinutes);
    return eta !== undefined
      ? {
          title: `الوصول حوالي ${clock(new Date(now.getTime() + eta * 60_000), l)}`,
          body: `تقدير جديد${c.destination ? ` للوصول إلى ${c.destination}` : ''}: حوالي ${Math.round(eta)} دقيقة.`,
        }
      : { title: 'تحديث وقت الوصول', body: `تغيّر الوقت المقدّر للوصول${c.destination ? ` إلى ${c.destination}` : ''}.` };
  },
  trip_tracking_unavailable: (c) => ({
    title: 'توقف التتبع المباشر',
    body: `الرحلة مستمرة بشكل عادي. سيتم تحديث موقع ${c.otherName ?? 'السائق'} في أقرب وقت.`,
  }),
  trip_arriving: (c) => ({
    title: c.destination ? `اقتربت من ${c.destination}` : 'اقتربت من الوصول',
    body: 'الوصول خلال دقائق. لا تنسَ أغراضك.',
  }),
  trip_completed: (c, p) => ({
    title: 'كيف كانت الرحلة؟',
    body: `قيّم ${c.otherName ?? str(p.driverName) ?? str(p.riderName) ?? 'رحلتك'}${c.route ? ` (${c.route})` : ''}. يستغرق ذلك ثوانٍ.`,
  }),
  trip_completion_reminder: (c) => ({
    title: 'هل انتهت الرحلة؟',
    body: `أكّد انتهاء ${c.route ? `رحلة ${c.route}` : 'الرحلة'} لتتمكن من تقييمها.`,
  }),
  rating_received: (c, p) => {
    const stars = num(p.stars);
    return {
      title: stars !== undefined ? `تقييم جديد: ${stars.toFixed(1)}/5` : 'تقييم جديد',
      body: `${str(p.raterName) ?? c.otherName ?? 'عضو'} قيّمك${c.route ? ` بعد رحلة ${c.route}` : ''}.`,
    };
  },
  recurring_pattern_detected: (c) => ({
    title: 'رحلة منتظمة؟',
    body: `تقوم كثيرًا برحلة ${c.route ?? 'هذا المسار'}. فعّلها لتصلك الرحلات الجديدة.`,
  }),
  recurring_proactive_match: (c, _p, l, now) => ({
    title: c.route ? `رحلة جديدة · ${c.route}` : 'رحلة جديدة مطابقة',
    body: join([
      `${c.otherName ?? 'سائق'} ينطلق${c.departureAt ? ` ${when(c.departureAt, l, now)}` : ''}`,
      c.seatsAvailable && seatsAr(c.seatsAvailable),
      c.pricePerSeat !== undefined && `${c.pricePerSeat} د.ت للمقعد`,
    ]),
  }),
  demand_signal_matched: (c, _p, l, now) => ({
    title: c.route ? `رحلة متاحة · ${c.route}` : 'رحلة تطابق بحثك',
    body: join([c.departureAt && when(c.departureAt, l, now), c.pricePerSeat !== undefined && `${c.pricePerSeat} د.ت للمقعد`, 'احجز قبل أن تمتلئ']),
  }),
  verification_submitted: () => ({
    title: 'تم استلام الوثائق',
    body: 'نقوم بالتحقق من ملفك كسائق وسنعلمك فور الانتهاء.',
  }),
  verification_approved: (_c, p) => ({
    title: 'تم التحقق من ملف السائق',
    body: (num(p.publishedRideCount) ?? 0) > 0 ? 'رحلتك المعلّقة منشورة الآن.' : 'يمكنك الآن نشر رحلاتك.',
  }),
  verification_declined: (_c, p) => ({
    title: 'رُفض التحقق',
    body: str(p.declineMessage) ?? 'افتح VAYA لمعرفة السبب.',
  }),
  verification_resubmission_required: (_c, p) => ({
    title: 'وثيقة تحتاج إلى تحديث',
    body: str(p.declineMessage) ?? 'افتح VAYA لمعرفة ما يجب تصحيحه.',
  }),
};

const BOOKS: Record<NotificationLocale, Partial<Record<NotificationEventType, Builder>>> = { fr: FR, en: EN, ar: AR };

const FALLBACK: Record<NotificationLocale, NotificationText> = {
  fr: { title: 'VAYA', body: 'Ouvrez VAYA pour voir les détails.' },
  en: { title: 'VAYA', body: 'Open VAYA to see the details.' },
  ar: { title: 'VAYA', body: 'افتح VAYA للاطلاع على التفاصيل.' },
};

export function composeNotification(
  type: NotificationEventType,
  payload: Payload,
  context: NotificationContext,
  locale: NotificationLocale,
  now: Date = new Date(),
): NotificationText {
  const builder = BOOKS[locale][type] ?? BOOKS.fr[type];
  if (!builder) return FALLBACK[locale];
  const text = builder(context, payload, locale, now);
  return { title: text.title.trim(), body: text.body.replace(/\s+/g, ' ').trim() };
}

/** Message bodies are user text: flattened and capped for a lock screen. */
export function messagePreview(body: string): string {
  return preview(body);
}
