import { describe, it, expect } from 'vitest';
import { NOTIFICATION_EVENT_TYPES, isEmailOnlyNotificationType } from '@vaya/domain';
import {
  composeNotification,
  firstName,
  messagePreview,
  routeLabel,
  when,
  type NotificationContext,
  type NotificationLocale,
} from '../notification-copy.js';

// 2026-10-15 17:00 UTC = 18:00 in Tunis.
const NOW = new Date('2026-10-15T17:00:00Z');
const TONIGHT = new Date('2026-10-15T18:14:00Z'); // 19:14 Tunis
const LATER = new Date('2026-10-17T07:30:00Z'); // Sat 08:30 Tunis

const FULL: NotificationContext = {
  role: 'rider',
  otherName: 'Mehdi',
  route: routeLabel('R4MF+76P، Rue 6863، Tunis, Tunisia', 'Gare de Sousse, Sousse, Tunisia'),
  destination: 'Sousse',
  departureAt: TONIGHT,
  meetingPoint: 'La Marsa, Plage',
  vehicle: 'Volkswagen Golf 7, Blanc · 198 TU 3301',
  seats: 2,
  pricePerSeat: 14,
  seatsAvailable: 2,
  expiresAt: new Date('2026-10-15T17:45:00Z'),
  messagePreview: 'Je suis devant la station Total',
};

const PUSHABLE = NOTIFICATION_EVENT_TYPES.filter((t) => !isEmailOnlyNotificationType(t));
const LOCALES: NotificationLocale[] = ['fr', 'en', 'ar'];
const GENERIC = ['Vous avez une nouvelle notification', 'Ouvrez VAYA pour voir les détails', 'Open VAYA to see the details'];

describe('composeNotification', () => {
  it('has real copy for every pushable type in every language — never the generic fallback', () => {
    for (const locale of LOCALES) {
      for (const type of PUSHABLE) {
        const { title, body } = composeNotification(type, {}, FULL, locale, NOW);
        expect(title, `${locale}/${type}`).not.toBe('VAYA');
        for (const g of GENERIC) expect(body, `${locale}/${type}`).not.toContain(g);
      }
    }
  });

  it('never leaks undefined/null or dangling punctuation, with or without context', () => {
    for (const locale of LOCALES) {
      for (const type of PUSHABLE) {
        for (const ctx of [FULL, {}]) {
          const { title, body } = composeNotification(type, {}, ctx, locale, NOW);
          const text = `${title} | ${body}`;
          expect(text, `${locale}/${type}`).not.toMatch(/undefined|null|NaN/);
          expect(text, `${locale}/${type}`).not.toMatch(/ ,|,\.|\.\.|· ·|\( \)|^\s|\s$/);
          expect(body.length, `${locale}/${type}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('names who, which trip, when and where (French)', () => {
    expect(composeNotification('booking_accepted', {}, FULL, 'fr', NOW)).toEqual({
      title: 'Mehdi a accepté votre demande',
      body: "Tunis → Sousse, aujourd'hui à 19:14. Rendez-vous : La Marsa, Plage.",
    });
    expect(composeNotification('trip_pickup_arrived', {}, FULL, 'fr', NOW)).toEqual({
      title: 'Mehdi vous attend',
      body: 'Au point de rendez-vous : La Marsa, Plage. Volkswagen Golf 7, Blanc · 198 TU 3301',
    });
    expect(composeNotification('booking_requested', {}, { ...FULL, role: 'driver' }, 'fr', NOW)).toEqual({
      title: 'Nouvelle demande · Tunis → Sousse',
      body: "Mehdi demande 2 places pour aujourd'hui à 19:14. Répondez avant 18:45.",
    });
  });

  it("quotes the passenger's request message before the deadline", () => {
    expect(
      composeNotification('booking_requested', { requestMessage: "J'ai une valise" }, { ...FULL, role: 'driver' }, 'fr', NOW).body,
    ).toBe("Mehdi demande 2 places pour aujourd'hui à 19:14. « J'ai une valise » Répondez avant 18:45.");
  });

  it('announces a terms update, with the date when it applies later', () => {
    const later = composeNotification('legal_update', { version: '3.0', effectiveOn: '2026-11-20' }, {}, 'fr', NOW);
    expect(later.title).toBe('Nos conditions évoluent (version 3.0)');
    expect(later.body).toContain('à partir du 20 novembre');
    const now = composeNotification('legal_update', { version: '2.1', effectiveOn: '2000-01-01' }, {}, 'en', NOW);
    expect(now.body).toBe("The Terms and Privacy Policy have been updated. Tap to see what's changing.");
  });

  it('says who cancelled and what it means for the recipient', () => {
    const toDriver = composeNotification('booking_cancelled', {}, { ...FULL, role: 'driver', seats: 1 }, 'fr', NOW);
    expect(toDriver.title).toBe('Mehdi a annulé sa réservation');
    expect(toDriver.body).toContain('1 place à nouveau disponible');
    const toRider = composeNotification('booking_cancelled', {}, FULL, 'fr', NOW);
    expect(toRider.title).toBe('Mehdi a annulé votre trajet');
    expect(toRider.body).toContain('Cherchez un autre trajet');
  });

  it('shows the actual message, in the sender’s name', () => {
    expect(composeNotification('message_received', {}, FULL, 'en', NOW)).toEqual({
      title: 'Mehdi · Tunis → Sousse',
      body: 'Je suis devant la station Total',
    });
  });

  it('writes English and Arabic, not French, for those users', () => {
    expect(composeNotification('trip_driver_approaching', {}, FULL, 'en', NOW).title).toBe('Mehdi is on the way');
    expect(composeNotification('trip_driver_approaching', {}, FULL, 'ar', NOW).title).toBe('Mehdi في الطريق');
  });

  it('gives a deadline its day unless it is today', () => {
    const tomorrowNoon = { ...FULL, role: 'driver' as const, expiresAt: new Date('2026-10-16T11:00:00Z') };
    expect(composeNotification('booking_requested', {}, tomorrowNoon, 'fr', NOW).body).toContain('Répondez avant demain à 12:00.');
    expect(composeNotification('booking_deadline_approaching', {}, tomorrowNoon, 'en', NOW).body).toContain(
      'Reply needed before tomorrow at 12:00.',
    );
  });

  it('turns an ETA into a clock time', () => {
    expect(composeNotification('trip_eta_changed', { etaMinutes: 12 }, FULL, 'fr', NOW).title).toBe('Arrivée vers 18:12');
  });

  it('uses the reviewer message when there is one', () => {
    expect(composeNotification('verification_declined', { declineMessage: 'Permis illisible' }, {}, 'fr', NOW).body).toBe(
      'Permis illisible',
    );
  });
});

describe('formatting helpers', () => {
  it('says today/tomorrow, else the weekday, in Tunis time on a 24-hour clock', () => {
    expect(when(TONIGHT, 'fr', NOW)).toBe("aujourd'hui à 19:14");
    expect(when(new Date('2026-10-16T07:30:00Z'), 'en', NOW)).toBe('tomorrow at 08:30');
    expect(when(LATER, 'fr', NOW)).toMatch(/^sam\.? 17 oct\.? à 08:30$/);
  });

  it('cleans names, routes and message previews', () => {
    expect(firstName('  Mehdi   Jaziri ')).toBe('Mehdi');
    expect(firstName('')).toBeUndefined();
    // Same town at both ends falls back to the more precise short labels.
    expect(routeLabel('Rue 6863, Tunis, Tunisia', 'Bab Saadoun, Tunis, Tunisia')).toBe('Rue 6863, Tunis → Bab Saadoun, Tunis');
    expect(routeLabel('R4MF+76P، Rue 6863، Tunis, Tunisia', 'Sidi Abdel Aziz, Marsa, Tunisia')).toBe(
      'Tunis → Marsa',
    );
    const long = 'a '.repeat(100);
    expect(messagePreview(long).length).toBeLessThanOrEqual(120);
    expect(messagePreview('hi\n\n  there')).toBe('hi there');
  });
});
