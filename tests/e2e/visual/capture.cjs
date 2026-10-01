/**
 * Captures every screen in light and dark mode plus the main search flow.
 * Usage: start the web build pointed at the mock host, then run this —
 *   (apps/mobile) API_BASE_URL=http://vaya-mock.test/api/v1 npx expo start --web --port 8081
 *   (tests/e2e)   pnpm visual:capture
 * Screenshots land in tests/e2e/visual/output/ (git-ignored).
 */
const path = require('path');
const { open, OUT } = require('./harness.cjs');

const ROUTES = [
  ['10-trips', '/trips'], ['11-publish', '/publish'], ['12-messages', '/messages'], ['13-profile', '/profile'],
  ['14-notifications', '/notifications'], ['15-recurring', '/recurring'], ['16-terms', '/legal/terms'],
  ['17-driver-onboarding', '/driver/onboarding'], ['18-vehicle', '/driver/onboarding/vehicle'],
  ['19-driver-ride', '/driver/rides/r1'], ['20-booking-detail', '/bookings/b1'], ['21-conversation', '/conversations/b1'],
  ['22-composer', '/search/composer?field=destination'], ['23-trust', '/search/trust?rideId=rc1&driverUserId=u-d1'],
  ['25-confirmed', '/bookings/confirmed?bookingId=b2&driverName=Ines%20Mansouri&price=9&vehicleLabel=Clio&pickupLabel=Ariana&destinationLabel=Bizerte'],
  ['26-pending', '/bookings/pending?bookingId=b1&driverName=Mehdi%20Jaziri&price=11&vehicleLabel=Golf%207&vehiclePlate=198%20TU%203301&driverRatingAvg=4.9'],
  ['27-pickup', '/bookings/pickup?bookingId=b1&driverName=Mehdi%20Jaziri&driverUserId=u-d1&price=11&vehicleLabel=Golf%207&pickupLabel=La%20Marsa'],
  ['28-live', '/bookings/live?bookingId=b1&driverName=Mehdi%20Jaziri&price=11&vehicleLabel=Golf%207&destinationLabel=Nabeul'],
  ['29-settlement', '/bookings/settlement?bookingId=b1&driverName=Mehdi%20Jaziri&price=11&destinationLabel=Nabeul'],
  ['30-onb-confirmation', '/driver/onboarding/confirmation?originLabel=Tunis&destinationLabel=Sousse&status=done'],
  ['31-stops-selection', '/driver/stops-selection?rideId=r1'], ['32-sign-in', '/sign-in'], ['33-otp', '/otp?phone=%2B216%2022%20123%20456'],
  ['34-privacy', '/legal/privacy'], ['35-resubmit', '/driver/onboarding/resubmit'], ['36-license', '/driver/onboarding/license'],
];

async function captureRoutes(scheme) {
  const prefix = scheme === 'dark' ? 'dark-' : '';
  const h = await open({ scheme });
  for (const [name, route] of ROUTES) {
    try {
      await h.go(route, 3500);
      await h.shot(prefix + name);
    } catch (e) {
      console.log('FAIL', name, e.message);
    }
  }
  await h.done();
}

async function captureSearchFlow() {
  const h = await open({ scheme: 'light' });
  const p = h.page;
  const click = async (text, wait = 1500) => {
    await p.getByText(text).first().click({ timeout: 4000 });
    await p.waitForTimeout(wait);
  };
  await h.go('/explore', 4000);
  await h.shot('40-explore');
  await click("Aujourd'hui");
  await h.shot('41-date-sheet');
  await h.go('/explore', 3000);
  await click('Où allez-vous');
  await p.keyboard.type('Sous', { delay: 60 });
  await p.waitForTimeout(1500);
  await h.shot('42-composer-results');
  await click('Gare de Sousse', 2500);
  await click('Rechercher', 3500);
  await h.shot('43-results');
  await click('Mehdi', 3500);
  await h.shot('44-ride-details');
  await h.done();
}

(async () => {
  await captureRoutes('light');
  await captureRoutes('dark');
  await captureSearchFlow();
  console.log('Screenshots written to', path.relative(process.cwd(), OUT) || OUT);
})();
