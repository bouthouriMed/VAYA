import { describe, it, expect } from 'vitest';
import { buildEmailTemplate } from '../email-templates.js';

describe('buildEmailTemplate', () => {
  it('renders an informative booking_requested email for the driver with a CTA deep link', () => {
    const email = buildEmailTemplate('booking_requested', {
      riderName: 'Amira Ben Salah',
      riderRatingAvg: 4.6,
      seatsRequested: 2,
      pickupLabel: 'Avenue Habib Bourguiba',
      originLabel: 'Tunis',
      destinationLabel: 'Sousse',
      departureAt: '2026-09-01T08:00:00.000Z',
      rideId: 'ride-123',
    });

    expect(email).not.toBeNull();
    expect(email!.subject).toContain('Tunis');
    expect(email!.subject).toContain('Sousse');
    expect(email!.html).toContain('Amira Ben Salah');
    expect(email!.html).toContain('2'); // seats requested
    expect(email!.html).toContain('Avenue Habib Bourguiba');
    expect(email!.html).toContain('4.6');
    expect(email!.html).toContain('vaya:///(tabs)/trips?openRequestsForRide=ride-123');
    expect(email!.text).toContain('Amira Ben Salah');
    expect(email!.text).toContain('vaya:///(tabs)/trips?openRequestsForRide=ride-123');
  });

  it('falls back to generic copy when optional booking_requested fields are missing', () => {
    const email = buildEmailTemplate('booking_requested', { rideId: 'ride-1' });
    expect(email).not.toBeNull();
    expect(email!.html).toContain('Un passager');
  });

  it('renders a booking_accepted confirmation email for the rider', () => {
    const email = buildEmailTemplate('booking_accepted', {
      driverName: 'Karim Trabelsi',
      originLabel: 'Tunis',
      destinationLabel: 'Sfax',
      departureAt: '2026-09-01T08:00:00.000Z',
    });

    expect(email).not.toBeNull();
    expect(email!.subject).toContain('confirmée');
    expect(email!.html).toContain('Karim Trabelsi');
    expect(email!.html).toContain('vaya:///(tabs)/trips');
  });

  it('renders a booking_declined email pointing back to search', () => {
    const email = buildEmailTemplate('booking_declined', {
      driverName: 'Karim Trabelsi',
      originLabel: 'Tunis',
      destinationLabel: 'Sfax',
    });

    expect(email).not.toBeNull();
    expect(email!.subject).toContain('refusée');
    expect(email!.html).toContain('vaya:///(tabs)/explore');
  });

  it('renders a booking_cancelled email only when the booking was confirmed and the recipient is the driver', () => {
    const emailedDriver = buildEmailTemplate('booking_cancelled', {
      wasConfirmed: true,
      recipientRole: 'driver',
      cancelledByName: 'Amira Ben Salah',
      originLabel: 'Tunis',
      destinationLabel: 'Sousse',
      departureAt: '2026-09-01T08:00:00.000Z',
    });
    expect(emailedDriver).not.toBeNull();
    expect(emailedDriver!.subject).toContain('annulée');
    expect(emailedDriver!.html).toContain('Amira Ben Salah');

    const pendingWithdrawal = buildEmailTemplate('booking_cancelled', {
      wasConfirmed: false,
      recipientRole: 'driver',
    });
    expect(pendingWithdrawal).toBeNull();

    const riderRecipient = buildEmailTemplate('booking_cancelled', {
      wasConfirmed: true,
      recipientRole: 'rider',
    });
    expect(riderRecipient).toBeNull();
  });

  it('renders a rating_received email for either party, including the comment when present', () => {
    const withComment = buildEmailTemplate('rating_received', {
      raterName: 'Karim Trabelsi',
      stars: 5,
      comment: 'Trajet impeccable, merci !',
    });
    expect(withComment).not.toBeNull();
    expect(withComment!.html).toContain('Karim Trabelsi');
    expect(withComment!.html).toContain('Trajet impeccable, merci !');
    expect(withComment!.html).toContain('5.0/5');

    const withoutComment = buildEmailTemplate('rating_received', {
      raterName: 'Amira Ben Salah',
      stars: 3,
    });
    expect(withoutComment).not.toBeNull();
    expect(withoutComment!.html).not.toContain('<blockquote');
  });

  it('returns null for event types that never emit email', () => {
    expect(buildEmailTemplate('trip_completed', {})).toBeNull();
    expect(buildEmailTemplate('message_received', {})).toBeNull();
    expect(buildEmailTemplate('verification_approved', {})).toBeNull();
  });
});
