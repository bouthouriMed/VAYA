import type { NotificationEventType } from '@vaya/domain';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// VAYA's brand tokens (packages/design-system/src/tokens/colors.ts) —
// duplicated as plain hex here rather than imported, since email HTML must
// be fully inlined (no external stylesheet, no CSS variables — most email
// clients strip both) and this is the only place in apps/api that renders
// HTML at all.
const BRAND = {
  ink: '#1C2429',
  sage: '#7FA491',
  sageDark: '#587566',
  cream: '#FAF8F2',
  creamDark: '#F3F1E9',
  gray: '#9B9788',
  warning: '#B08A4E',
  error: '#A65C4E',
};

// The mobile app's URL scheme (apps/mobile/app.config.js's `scheme: 'vaya'`)
// — the same routes notifications/deepLink.ts resolves on tap, reused here
// so an email's CTA opens the exact same in-app screen a push notification
// would. Only the small subset of routes the 5 email-emitting event types
// below actually need is reproduced; this is not a general deep-linking
// system (same scope boundary deepLink.ts's own doc comment states).
const APP_SCHEME = 'vaya://';

function appLink(path: string): string {
  return `${APP_SCHEME}${path}`;
}

function formatDepartureAt(iso: unknown): string {
  if (typeof iso !== 'string') return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const formatted = new Intl.DateTimeFormat('fr-TN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Tunis',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface ShellOptions {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  accent?: string;
}

/**
 * Shared branded wrapper every template below renders through — a single,
 * table-based layout (the compatibility baseline email clients like Outlook
 * still need) so every VAYA email reads as one consistent product surface
 * rather than five one-off HTML fragments. `preheader` is the hidden
 * preview-text snippet most inboxes show next to the subject line.
 */
function shell({ preheader, heading, bodyHtml, ctaLabel, ctaUrl, accent = BRAND.sage }: ShellOptions): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${BRAND.creamDark};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.creamDark};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:${BRAND.cream};border-radius:20px;overflow:hidden;">
            <tr>
              <td style="background-color:${BRAND.ink};padding:24px 32px;">
                <span style="font-size:20px;font-weight:700;letter-spacing:0.5px;color:${BRAND.cream};">VAYA</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:${BRAND.ink};">${escapeHtml(heading)}</h1>
                <div style="font-size:15px;line-height:1.6;color:${BRAND.ink};">${bodyHtml}</div>
                <div style="margin-top:28px;">
                  <a href="${ctaUrl}" style="display:inline-block;background-color:${accent};color:${BRAND.ink};font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:999px;">${escapeHtml(ctaLabel)}</a>
                </div>
                <p style="margin:20px 0 0;font-size:13px;color:${BRAND.gray};">Ce bouton ouvre directement l’app VAYA. Si rien ne se passe, ouvrez l’app et rendez-vous dans « Mes trajets ».</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid ${BRAND.creamDark};">
                <p style="margin:0;font-size:12px;color:${BRAND.gray};">Cet email a été envoyé automatiquement par VAYA — merci de ne pas y répondre.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function routeLine(originLabel: string, destinationLabel: string): string {
  if (!originLabel && !destinationLabel) return '';
  return `<strong>${escapeHtml(originLabel)}</strong> &rarr; <strong>${escapeHtml(destinationLabel)}</strong>`;
}

function renderBookingRequested(payload: Record<string, unknown>): RenderedEmail {
  const riderName = str(payload.riderName, 'Un passager');
  const originLabel = str(payload.originLabel);
  const destinationLabel = str(payload.destinationLabel);
  const seats = num(payload.seatsRequested) ?? 1;
  const pickupLabel = str(payload.pickupLabel);
  const rating = num(payload.riderRatingAvg);
  const departure = formatDepartureAt(payload.departureAt);
  const rideId = str(payload.rideId);

  const subject = `Nouvelle demande de réservation — ${originLabel || 'votre trajet'} → ${destinationLabel || ''}`.trim();

  const details = [
    `<li style="margin-bottom:6px;">🧭 Trajet : ${routeLine(originLabel, destinationLabel)}</li>`,
    departure ? `<li style="margin-bottom:6px;">🕒 Départ : ${escapeHtml(departure)}</li>` : '',
    `<li style="margin-bottom:6px;">💺 Places demandées : ${seats}</li>`,
    pickupLabel ? `<li style="margin-bottom:6px;">📍 Point de prise en charge : ${escapeHtml(pickupLabel)}</li>` : '',
    rating !== undefined ? `<li style="margin-bottom:6px;">⭐ Note du passager : ${rating.toFixed(1)}/5</li>` : '',
  ]
    .filter(Boolean)
    .join('');

  const bodyHtml = `
    <p style="margin:0 0 16px;">Bonjour,</p>
    <p style="margin:0 0 16px;"><strong>${escapeHtml(riderName)}</strong> souhaite réserver une place sur votre trajet. Voici les détails de la demande :</p>
    <ul style="margin:0 0 16px;padding-left:20px;">${details}</ul>
    <p style="margin:0;">Acceptez ou refusez cette demande depuis l’app — le passager attend votre réponse.</p>
  `;

  const ctaUrl = appLink(`/(tabs)/trips?openRequestsForRide=${encodeURIComponent(rideId)}`);

  return {
    subject,
    html: shell({
      preheader: `${riderName} souhaite réserver ${seats} place(s) sur votre trajet.`,
      heading: 'Nouvelle demande de réservation',
      bodyHtml,
      ctaLabel: 'Voir la demande et répondre',
      ctaUrl,
    }),
    text: [
      `${riderName} souhaite réserver une place sur votre trajet.`,
      originLabel && destinationLabel ? `Trajet : ${originLabel} -> ${destinationLabel}` : '',
      departure ? `Départ : ${departure}` : '',
      `Places demandées : ${seats}`,
      pickupLabel ? `Point de prise en charge : ${pickupLabel}` : '',
      rating !== undefined ? `Note du passager : ${rating.toFixed(1)}/5` : '',
      '',
      `Répondez depuis l’app VAYA : ${ctaUrl}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function renderBookingAccepted(payload: Record<string, unknown>): RenderedEmail {
  const driverName = str(payload.driverName, 'Le conducteur');
  const originLabel = str(payload.originLabel);
  const destinationLabel = str(payload.destinationLabel);
  const departure = formatDepartureAt(payload.departureAt);

  const subject = `Réservation confirmée — ${originLabel || 'votre trajet'} → ${destinationLabel || ''}`.trim();

  const bodyHtml = `
    <p style="margin:0 0 16px;">Bonne nouvelle !</p>
    <p style="margin:0 0 16px;"><strong>${escapeHtml(driverName)}</strong> a accepté votre demande de réservation pour le trajet ${routeLine(originLabel, destinationLabel)}.</p>
    ${departure ? `<p style="margin:0 0 16px;">🕒 Départ prévu : <strong>${escapeHtml(departure)}</strong></p>` : ''}
    <p style="margin:0;">Retrouvez tous les détails de votre trajet — itinéraire, point de rendez-vous et contact — dans l’app.</p>
  `;

  const ctaUrl = appLink('/(tabs)/trips');

  return {
    subject,
    html: shell({
      preheader: `${driverName} a accepté votre demande de réservation.`,
      heading: 'Réservation confirmée',
      bodyHtml,
      ctaLabel: 'Voir mon trajet',
      ctaUrl,
      accent: BRAND.sage,
    }),
    text: [
      `${driverName} a accepté votre demande de réservation.`,
      originLabel && destinationLabel ? `Trajet : ${originLabel} -> ${destinationLabel}` : '',
      departure ? `Départ prévu : ${departure}` : '',
      '',
      `Voir mon trajet : ${ctaUrl}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function renderBookingDeclined(payload: Record<string, unknown>): RenderedEmail {
  if (payload.reason === 'request_expired') return renderBookingExpired(payload);
  const driverName = str(payload.driverName, 'Le conducteur');
  const originLabel = str(payload.originLabel);
  const destinationLabel = str(payload.destinationLabel);

  const subject = `Réservation refusée — ${originLabel || 'votre trajet'} → ${destinationLabel || ''}`.trim();

  const bodyHtml = `
    <p style="margin:0 0 16px;"><strong>${escapeHtml(driverName)}</strong> n’a pas pu accepter votre demande pour le trajet ${routeLine(originLabel, destinationLabel)}.</p>
    <p style="margin:0;">Ce n’est pas grave — d’autres trajets correspondant à votre itinéraire sont probablement disponibles dès maintenant.</p>
  `;

  const ctaUrl = appLink('/(tabs)/explore');

  return {
    subject,
    html: shell({
      preheader: `${driverName} n’a pas pu accepter votre demande de réservation.`,
      heading: 'Réservation refusée',
      bodyHtml,
      ctaLabel: 'Rechercher un autre trajet',
      ctaUrl,
      accent: BRAND.warning,
    }),
    text: [
      `${driverName} n'a pas pu accepter votre demande de réservation.`,
      originLabel && destinationLabel ? `Trajet : ${originLabel} -> ${destinationLabel}` : '',
      '',
      `Rechercher un autre trajet : ${ctaUrl}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/**
 * Driver side: only a booking that had actually reached `accepted` is worth
 * an email (a withdrawn pending request isn't). Passenger side
 * (`recipientRole: 'rider'` — the driver, or an admin, cancelled): always
 * emailed, pending or confirmed, since the passenger is now without a ride. This function itself
 * still re-checks both — a defensive second gate, cheap and unambiguous —
 * since an email is a much harder action to "undo" than an in-app toast.
 */
function renderBookingCancelled(payload: Record<string, unknown>): RenderedEmail | null {
  if (payload.recipientRole === 'rider') return renderBookingCancelledForRider(payload);
  if (payload.wasConfirmed !== true || payload.recipientRole !== 'driver') return null;

  const cancelledByName = str(payload.cancelledByName, 'Le passager');
  const originLabel = str(payload.originLabel);
  const destinationLabel = str(payload.destinationLabel);
  const departure = formatDepartureAt(payload.departureAt);

  const subject = `Réservation annulée — ${originLabel || 'votre trajet'} → ${destinationLabel || ''}`.trim();

  const bodyHtml = `
    <p style="margin:0 0 16px;"><strong>${escapeHtml(cancelledByName)}</strong> a annulé une réservation confirmée sur votre trajet ${routeLine(originLabel, destinationLabel)}.</p>
    ${departure ? `<p style="margin:0 0 16px;">🕒 Départ initialement prévu : <strong>${escapeHtml(departure)}</strong></p>` : ''}
    <p style="margin:0;">La place correspondante est de nouveau disponible pour d’autres passagers.</p>
  `;

  const ctaUrl = appLink('/(tabs)/trips');

  return {
    subject,
    html: shell({
      preheader: `${cancelledByName} a annulé une réservation confirmée sur votre trajet.`,
      heading: 'Réservation annulée',
      bodyHtml,
      ctaLabel: 'Voir mon trajet',
      ctaUrl,
      accent: BRAND.error,
    }),
    text: [
      `${cancelledByName} a annulé une réservation confirmée sur votre trajet.`,
      originLabel && destinationLabel ? `Trajet : ${originLabel} -> ${destinationLabel}` : '',
      departure ? `Départ initialement prévu : ${departure}` : '',
      '',
      `Voir mon trajet : ${ctaUrl}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function renderRatingReceived(payload: Record<string, unknown>): RenderedEmail {
  const raterName = str(payload.raterName, 'Un utilisateur VAYA');
  const stars = num(payload.stars) ?? 0;
  const comment = str(payload.comment);
  const starsDisplay = '⭐'.repeat(Math.max(0, Math.min(5, Math.round(stars))));

  const subject = `Vous avez reçu un nouvel avis (${stars.toFixed(0)}/5) sur VAYA`;

  const bodyHtml = `
    <p style="margin:0 0 16px;"><strong>${escapeHtml(raterName)}</strong> vous a laissé un avis suite à votre trajet ensemble.</p>
    <p style="margin:0 0 16px;font-size:20px;">${starsDisplay || '☆☆☆☆☆'} <span style="font-size:15px;color:${BRAND.gray};">(${stars.toFixed(1)}/5)</span></p>
    ${comment ? `<p style="margin:0 0 16px;padding:12px 16px;background-color:${BRAND.creamDark};border-radius:12px;font-style:italic;">“${escapeHtml(comment)}”</p>` : ''}
    <p style="margin:0;">Votre profil VAYA reflète la confiance que vous construisez à chaque trajet.</p>
  `;

  const ctaUrl = appLink('/(tabs)/profile');

  return {
    subject,
    html: shell({
      preheader: `${raterName} vous a laissé un avis ${stars.toFixed(1)}/5.`,
      heading: 'Vous avez reçu un nouvel avis',
      bodyHtml,
      ctaLabel: 'Voir mon profil',
      ctaUrl,
    }),
    text: [
      `${raterName} vous a laissé un avis : ${stars.toFixed(1)}/5.`,
      comment ? `Commentaire : "${comment}"` : '',
      '',
      `Voir mon profil : ${ctaUrl}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function detailsList(items: string[]): string {
  const rows = items.filter(Boolean).map((item) => `<li style="margin-bottom:6px;">${item}</li>`).join('');
  return rows ? `<ul style="margin:0 0 16px;padding-left:20px;">${rows}</ul>` : '';
}

function textLines(lines: string[]): string {
  return lines.filter(Boolean).join('\n');
}

function formatPrice(value: unknown): string {
  const n = typeof value === 'string' ? Number(value) : num(value);
  return n !== undefined && Number.isFinite(n) ? `${n.toFixed(n % 1 === 0 ? 0 : 2)} DT` : '';
}

function renderBookingRequestSent(payload: Record<string, unknown>): RenderedEmail {
  const driverName = str(payload.driverName, 'le conducteur');
  const originLabel = str(payload.originLabel);
  const destinationLabel = str(payload.destinationLabel);
  const departure = formatDepartureAt(payload.departureAt);
  const deadline = formatDepartureAt(payload.expiresAt);
  const seats = num(payload.seatsRequested) ?? 1;
  const pickupLabel = str(payload.pickupLabel);
  const ctaUrl = appLink('/(tabs)/trips');

  const bodyHtml = `
    <p style="margin:0 0 16px;">Votre demande a bien été envoyée à <strong>${escapeHtml(driverName)}</strong>.</p>
    ${detailsList([
      `🧭 Trajet : ${routeLine(originLabel, destinationLabel)}`,
      departure ? `🕒 Départ : ${escapeHtml(departure)}` : '',
      `💺 Places demandées : ${seats}`,
      pickupLabel ? `📍 Point de prise en charge : ${escapeHtml(pickupLabel)}` : '',
    ])}
    <p style="margin:0;">${
      deadline
        ? `Le conducteur a jusqu’au <strong>${escapeHtml(deadline)}</strong> pour répondre. Nous vous prévenons dès qu’il le fait.`
        : 'Nous vous prévenons dès que le conducteur répond.'
    }</p>
  `;

  return {
    subject: `Demande envoyée — ${originLabel || 'votre trajet'} → ${destinationLabel}`.trim(),
    html: shell({
      preheader: `Votre demande a été envoyée à ${driverName}.`,
      heading: 'Demande de réservation envoyée',
      bodyHtml,
      ctaLabel: 'Suivre ma demande',
      ctaUrl,
    }),
    text: textLines([
      `Votre demande a bien été envoyée à ${driverName}.`,
      originLabel && destinationLabel ? `Trajet : ${originLabel} -> ${destinationLabel}` : '',
      departure ? `Départ : ${departure}` : '',
      `Places demandées : ${seats}`,
      pickupLabel ? `Point de prise en charge : ${pickupLabel}` : '',
      deadline ? `Réponse attendue avant : ${deadline}` : '',
      '',
      `Suivre ma demande : ${ctaUrl}`,
    ]),
  };
}

function renderBookingExpired(payload: Record<string, unknown>): RenderedEmail {
  const originLabel = str(payload.originLabel);
  const destinationLabel = str(payload.destinationLabel);
  const ctaUrl = appLink('/(tabs)/explore');

  const bodyHtml = `
    <p style="margin:0 0 16px;">Le conducteur n’a pas répondu à temps à votre demande${
      originLabel || destinationLabel ? ` pour le trajet ${routeLine(originLabel, destinationLabel)}` : ''
    }. Elle a expiré et aucune place ne vous est réservée.</p>
    <p style="margin:0;">D’autres trajets sur votre itinéraire sont peut-être déjà disponibles.</p>
  `;

  return {
    subject: 'Votre demande de réservation a expiré',
    html: shell({
      preheader: 'Le conducteur n’a pas répondu à temps.',
      heading: 'Demande expirée',
      bodyHtml,
      ctaLabel: 'Rechercher un autre trajet',
      ctaUrl,
      accent: BRAND.warning,
    }),
    text: textLines([
      "Le conducteur n'a pas répondu à temps : votre demande de réservation a expiré.",
      originLabel && destinationLabel ? `Trajet : ${originLabel} -> ${destinationLabel}` : '',
      '',
      `Rechercher un autre trajet : ${ctaUrl}`,
    ]),
  };
}

function renderBookingCancelledForRider(payload: Record<string, unknown>): RenderedEmail {
  const byAdmin = payload.cancelledBy === 'admin';
  const who = byAdmin ? 'L’équipe VAYA' : str(payload.cancelledByName, 'Le conducteur');
  const originLabel = str(payload.originLabel);
  const destinationLabel = str(payload.destinationLabel);
  const departure = formatDepartureAt(payload.departureAt);
  const wholeRide = payload.reason === 'ride_cancelled' || byAdmin;
  const ctaUrl = appLink('/(tabs)/explore');

  const what = wholeRide ? 'a annulé le trajet' : 'a annulé votre réservation';
  const bodyHtml = `
    <p style="margin:0 0 16px;"><strong>${escapeHtml(who)}</strong> ${what}${
      originLabel || destinationLabel ? ` ${routeLine(originLabel, destinationLabel)}` : ''
    }.</p>
    ${departure ? `<p style="margin:0 0 16px;">🕒 Départ initialement prévu : <strong>${escapeHtml(departure)}</strong></p>` : ''}
    <p style="margin:0;">Votre place n’est plus réservée. Cherchez un autre trajet pour vous y rendre.</p>
  `;

  return {
    subject: `Trajet annulé — ${originLabel || 'votre réservation'} → ${destinationLabel}`.trim(),
    html: shell({
      preheader: `${who} ${what}.`,
      heading: wholeRide ? 'Trajet annulé' : 'Réservation annulée',
      bodyHtml,
      ctaLabel: 'Rechercher un autre trajet',
      ctaUrl,
      accent: BRAND.error,
    }),
    text: textLines([
      `${who} ${what}.`,
      originLabel && destinationLabel ? `Trajet : ${originLabel} -> ${destinationLabel}` : '',
      departure ? `Départ initialement prévu : ${departure}` : '',
      '',
      `Rechercher un autre trajet : ${ctaUrl}`,
    ]),
  };
}

function renderRidePublished(payload: Record<string, unknown>): RenderedEmail {
  const originLabel = str(payload.originLabel);
  const destinationLabel = str(payload.destinationLabel);
  const departure = formatDepartureAt(payload.departureAt);
  const seats = num(payload.seatsAvailable);
  const price = formatPrice(payload.contributionPerSeat);
  const rideId = str(payload.rideId);
  const ctaUrl = appLink(rideId ? `/driver/rides/${encodeURIComponent(rideId)}` : '/(tabs)/trips');

  const bodyHtml = `
    <p style="margin:0 0 16px;">Votre trajet est en ligne. Les passagers sur votre itinéraire peuvent maintenant le trouver et réserver.</p>
    ${detailsList([
      `🧭 Trajet : ${routeLine(originLabel, destinationLabel)}`,
      departure ? `🕒 Départ : ${escapeHtml(departure)}` : '',
      seats !== undefined ? `💺 Places proposées : ${seats}` : '',
      price ? `💰 Participation par place : ${escapeHtml(price)}` : '',
    ])}
    <p style="margin:0;">Vous recevrez un email à chaque nouvelle demande de réservation.</p>
  `;

  return {
    subject: `Trajet publié — ${originLabel || 'votre trajet'} → ${destinationLabel}`.trim(),
    html: shell({
      preheader: 'Votre trajet est en ligne.',
      heading: 'Votre trajet est publié',
      bodyHtml,
      ctaLabel: 'Voir mon trajet',
      ctaUrl,
    }),
    text: textLines([
      'Votre trajet est publié.',
      originLabel && destinationLabel ? `Trajet : ${originLabel} -> ${destinationLabel}` : '',
      departure ? `Départ : ${departure}` : '',
      seats !== undefined ? `Places proposées : ${seats}` : '',
      price ? `Participation par place : ${price}` : '',
      '',
      `Voir mon trajet : ${ctaUrl}`,
    ]),
  };
}

function renderVerificationSubmitted(): RenderedEmail {
  const ctaUrl = appLink('/(tabs)/profile');
  return {
    subject: 'Vos documents conducteur ont bien été reçus',
    html: shell({
      preheader: 'Votre vérification conducteur est en cours.',
      heading: 'Vérification en cours',
      bodyHtml: `
        <p style="margin:0 0 16px;">Merci ! Nous avons bien reçu votre permis, votre assurance et votre selfie de vérification.</p>
        <p style="margin:0;">Notre équipe vérifie votre profil. Vous recevrez un email dès que la vérification est terminée.</p>
      `,
      ctaLabel: 'Voir mon profil',
      ctaUrl,
    }),
    text: textLines([
      'Nous avons bien reçu vos documents conducteur. Notre équipe vérifie votre profil — vous recevrez un email dès que c’est terminé.',
      '',
      `Voir mon profil : ${ctaUrl}`,
    ]),
  };
}

function renderVerificationApproved(): RenderedEmail {
  const ctaUrl = appLink('/(tabs)/publish');
  return {
    subject: 'Vous êtes conducteur vérifié sur VAYA',
    html: shell({
      preheader: 'Votre profil conducteur est vérifié.',
      heading: 'Profil conducteur vérifié',
      bodyHtml: `
        <p style="margin:0 0 16px;">Bonne nouvelle : votre profil conducteur est vérifié.</p>
        <p style="margin:0;">Vous pouvez publier vos trajets et partager vos frais de route avec des passagers.</p>
      `,
      ctaLabel: 'Publier un trajet',
      ctaUrl,
    }),
    text: textLines([
      'Votre profil conducteur est vérifié. Vous pouvez publier vos trajets.',
      '',
      `Publier un trajet : ${ctaUrl}`,
    ]),
  };
}

function renderVerificationNotApproved(
  payload: Record<string, unknown>,
  resubmission: boolean,
): RenderedEmail {
  const message = str(payload.declineMessage);
  const ctaUrl = appLink(resubmission ? '/driver/onboarding/resubmit' : '/(tabs)/profile');
  const heading = resubmission ? 'Vérification à compléter' : 'Vérification refusée';
  const intro = resubmission
    ? 'Nous avons besoin que vous mettiez à jour certains documents pour terminer votre vérification conducteur.'
    : 'Nous n’avons pas pu valider votre profil conducteur.';

  return {
    subject: resubmission ? 'Votre vérification conducteur est à compléter' : 'Votre vérification conducteur a été refusée',
    html: shell({
      preheader: intro,
      heading,
      bodyHtml: `
        <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
        ${message ? `<p style="margin:0 0 16px;padding:12px 16px;background-color:${BRAND.creamDark};border-radius:12px;">${escapeHtml(message)}</p>` : ''}
        <p style="margin:0;">${resubmission ? 'Vous pouvez renvoyer vos documents directement depuis l’app.' : 'Les détails sont disponibles dans l’app.'}</p>
      `,
      ctaLabel: resubmission ? 'Mettre à jour mes documents' : 'Voir mon profil',
      ctaUrl,
      accent: resubmission ? BRAND.warning : BRAND.error,
    }),
    text: textLines([intro, message ? `Motif : ${message}` : '', `Ouvrir l’app : ${ctaUrl}`]),
  };
}

function renderTripCompleted(payload: Record<string, unknown>): RenderedEmail {
  const originLabel = str(payload.originLabel);
  const destinationLabel = str(payload.destinationLabel);
  const counterpartName = str(payload.counterpartName);
  const ctaUrl = appLink('/(tabs)/trips');

  const rateLine = counterpartName
    ? `Prenez quelques secondes pour noter <strong>${escapeHtml(counterpartName)}</strong> : les avis rendent VAYA plus sûr pour tout le monde. Vous avez 24 h.`
    : 'Prenez quelques secondes pour laisser un avis : les avis rendent VAYA plus sûr pour tout le monde. Vous avez 24 h.';

  return {
    subject: `Trajet terminé${originLabel ? ` — ${originLabel} → ${destinationLabel}` : ''}`,
    html: shell({
      preheader: 'Merci d’avoir voyagé avec VAYA.',
      heading: 'Trajet terminé',
      bodyHtml: `
        <p style="margin:0 0 16px;">Votre trajet${originLabel || destinationLabel ? ` ${routeLine(originLabel, destinationLabel)}` : ''} est terminé. Merci d’avoir voyagé avec VAYA !</p>
        <p style="margin:0;">${rateLine}</p>
      `,
      ctaLabel: 'Laisser un avis',
      ctaUrl,
    }),
    text: textLines([
      'Votre trajet est terminé. Merci d’avoir voyagé avec VAYA !',
      originLabel && destinationLabel ? `Trajet : ${originLabel} -> ${destinationLabel}` : '',
      counterpartName ? `Laissez un avis à ${counterpartName} (24 h).` : 'Laissez un avis (24 h).',
      `Laisser un avis : ${ctaUrl}`,
    ]),
  };
}

/**
 * Renders the email for one dispatched notification, or `null` when this
 * event type has no email. Email covers the milestones a user expects a
 * written record of: booking requests and their outcome (sent, accepted,
 * declined/expired, cancelled — both sides), a ride being published, each
 * step of driver verification, a finished trip, and a review received.
 * Live in-trip events (approaching, onboard, ETA…) and messages stay
 * push/in-app only.
 * Pure and side-effect-free so it's directly unit-testable — the actual
 * send happens in notifications.service.ts's dispatchEmailForNotification.
 */
export function buildEmailTemplate(
  type: NotificationEventType,
  payload: Record<string, unknown>,
): RenderedEmail | null {
  switch (type) {
    case 'booking_requested':
      return renderBookingRequested(payload);
    case 'booking_accepted':
      return renderBookingAccepted(payload);
    case 'booking_declined':
      return renderBookingDeclined(payload);
    case 'booking_cancelled':
      return renderBookingCancelled(payload);
    case 'rating_received':
      return renderRatingReceived(payload);
    case 'booking_request_sent':
      return renderBookingRequestSent(payload);
    case 'ride_published':
      return renderRidePublished(payload);
    case 'verification_submitted':
      return renderVerificationSubmitted();
    case 'verification_approved':
      return renderVerificationApproved();
    case 'verification_declined':
      return renderVerificationNotApproved(payload, false);
    case 'verification_resubmission_required':
      return renderVerificationNotApproved(payload, true);
    case 'trip_completed':
      return renderTripCompleted(payload);
    default:
      return null;
  }
}
