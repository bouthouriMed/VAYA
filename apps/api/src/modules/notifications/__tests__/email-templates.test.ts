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

  it('emails the driver only for a confirmed booking, and the passenger whenever the driver cancels', () => {
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
      wasConfirmed: false,
      recipientRole: 'rider',
      cancelledBy: 'driver',
      reason: 'ride_cancelled',
      originLabel: 'Tunis',
      destinationLabel: 'Sousse',
    });
    expect(riderRecipient).not.toBeNull();
    expect(riderRecipient!.html).toContain('a annulé le trajet');

    const byAdmin = buildEmailTemplate('booking_cancelled', {
      recipientRole: 'rider',
      cancelledBy: 'admin',
    });
    expect(byAdmin!.html).toContain('L’équipe VAYA');
  });

  it('sends the passenger a receipt when their request is sent, with the response deadline', () => {
    const email = buildEmailTemplate('booking_request_sent', {
      driverName: 'Sami',
      originLabel: 'Tunis',
      destinationLabel: 'Sousse',
      departureAt: '2026-09-01T08:00:00.000Z',
      expiresAt: '2026-08-31T20:00:00.000Z',
      seatsRequested: 2,
    });
    expect(email!.subject).toContain('Demande envoyée');
    expect(email!.html).toContain('Sami');
    expect(email!.html).toContain('pour répondre');
    expect(email!.text).toContain('Places demandées : 2');
  });

  it('tells the passenger their request expired rather than that the driver declined it', () => {
    const email = buildEmailTemplate('booking_declined', { reason: 'request_expired' });
    expect(email!.subject).toContain('expiré');
  });

  it('confirms a published ride to the driver with seats and price', () => {
    const email = buildEmailTemplate('ride_published', {
      rideId: 'r1',
      originLabel: 'Tunis',
      destinationLabel: 'Sfax',
      seatsAvailable: 3,
      contributionPerSeat: 18,
    });
    expect(email!.subject).toContain('Trajet publié');
    expect(email!.html).toContain('18 DT');
    expect(email!.html).toContain('vaya:///driver/rides/r1');
  });

  it('covers every driver-verification step, including the reviewer message', () => {
    expect(buildEmailTemplate('verification_submitted', {})!.subject).toContain('reçus');
    expect(buildEmailTemplate('verification_approved', {})!.subject).toContain('vérifié');
    expect(buildEmailTemplate('verification_approved', {})!.html).toContain('Publier un trajet');
    // A ride saved while under review was published by the approval itself —
    // the email points at it instead of inviting a duplicate publish.
    const withRide = buildEmailTemplate('verification_approved', { publishedRideCount: 1 });
    expect(withRide!.html).toContain('maintenant publié');
    expect(withRide!.html).not.toContain('Publier un trajet');
    const declined = buildEmailTemplate('verification_declined', { declineMessage: 'Permis illisible' });
    expect(declined!.html).toContain('Permis illisible');
    const resubmit = buildEmailTemplate('verification_resubmission_required', {});
    expect(resubmit!.html).toContain('driver/onboarding/resubmit');
  });

  it('asks both parties to review once a trip is completed', () => {
    const email = buildEmailTemplate('trip_completed', {
      originLabel: 'Tunis',
      destinationLabel: 'Sousse',
      counterpartName: 'Amira',
    });
    expect(email!.html).toContain('Amira');
    expect(email!.subject).toContain('Trajet terminé');
  });

  it('escapes user-provided text', () => {
    const email = buildEmailTemplate('verification_declined', { declineMessage: '<script>x</script>' });
    expect(email!.html).not.toContain('<script>x');
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

  it('returns null for live/in-app-only event types', () => {
    expect(buildEmailTemplate('message_received', {})).toBeNull();
    expect(buildEmailTemplate('trip_driver_approaching', {})).toBeNull();
    expect(buildEmailTemplate('trip_eta_changed', {})).toBeNull();
  });
});
