/**
 * Visual capture harness for the Expo web build (see README.md).
 *
 * Runs the mobile app in Chromium at phone size with EVERY API call answered
 * from the local fixtures below — nothing is ever sent to a real backend.
 * Two native-only modules have no web build, so the served bundle is patched
 * in flight (never on disk): expo-secure-store gets a localStorage shim, and
 * react-native-maps is replaced by a grid placeholder that still fires
 * onMapReady. Map rendering itself must still be checked on a device.
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.VAYA_WEB || 'http://localhost:8081';
const API = 'http://vaya-mock.test/api/v1';
const OUT = process.env.VAYA_SHOTS ? path.resolve(process.env.VAYA_SHOTS) : path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });

function encodePolyline(coords) {
  let out = '', pLat = 0, pLng = 0;
  const enc = (v) => { v = v < 0 ? ~(v << 1) : v << 1; let s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  for (const [lat, lng] of coords) { const a = Math.round(lat * 1e5), b = Math.round(lng * 1e5); out += enc(a - pLat) + enc(b - pLng); pLat = a; pLng = b; }
  return out;
}
const ROUTE = [[36.8065,10.1815],[36.74,10.23],[36.66,10.33],[36.55,10.45],[36.40,10.55],[36.25,10.48],[36.13,10.38],[36.00,10.45],[35.8256,10.6084]];
const POLY = encodePolyline(ROUTE);
const now = Date.now();
const iso = (mins) => new Date(now + mins * 60000).toISOString();

const ME = { id: 'u-me', phone: '+21622123456', email: null, authProvider: 'phone', fullName: 'Amine Ben Salah', avatarUrl: null, locale: 'fr', createdAt: iso(-60*24*120), updatedAt: iso(-60) };
const VEHICLE = { id: 'v1', driverProfileId: 'dp-me', make: 'Peugeot', model: '208', color: 'Gris', plateNumber: '214 TU 5521', seatCount: 4, photoUrl: null };
const DRIVER = { id: 'dp-me', userId: 'u-me', verificationStatus: 'approved', bio: 'Trajets réguliers Tunis–Sousse.', ratingAvg: 4.8, tripCount: 23, punctualityScore: 0.94, reliabilityScore: 0.96, approvedAt: iso(-60*24*30), verificationDeclineReason: null, verificationDeclineMessage: null, verificationAttempt: 1, vehicles: [VEHICLE], documents: [] };
const RIDE = { id: 'r1', driverProfileId: 'dp-me', vehicleId: 'v1', routeId: null, originLabel: 'Tunis, Centre-ville', originLat: 36.8065, originLng: 10.1815, destinationLabel: 'Sousse, Médina', destinationLat: 35.8256, destinationLng: 10.6084, departureAt: iso(60*20), seatsTotal: 4, seatsAvailable: 2, contributionPerSeat: 14, status: 'published', routePolyline: POLY, estimatedDurationSec: 8400, routeKind: 'fastest' };
const STOPS = [
  { id: 's1', rideId: 'r1', sequence: 1, label: 'Ben Arous, Station Total', lat: 36.74, lng: 10.23, roadSnapped: true, deviationMeters: 120, deviationSeconds: 40, suitabilityScore: 0.9, roadClass: null, isDriverSelected: true },
  { id: 's2', rideId: 'r1', sequence: 2, label: 'Hammamet Nord, Rond-point', lat: 36.40, lng: 10.55, roadSnapped: true, deviationMeters: 300, deviationSeconds: 90, suitabilityScore: 0.8, roadClass: null, isDriverSelected: true },
  { id: 's3', rideId: 'r1', sequence: 3, label: 'Enfidha, Centre', lat: 36.13, lng: 10.38, roadSnapped: true, deviationMeters: 500, deviationSeconds: 150, suitabilityScore: 0.7, roadClass: null, isDriverSelected: false },
];
const rider = (id, name) => ({ id, fullName: name, avatarUrl: null });
const BOOKING_BASE = { seatsRequested: 1, contributionTotal: 14, pickupStopId: 's1', pickupLabel: 'Ben Arous, Station Total', pickupLat: 36.74, pickupLng: 10.23, pickupWalkMeters: 240, dropoffStopId: null, dropoffLabel: null, dropoffLat: null, dropoffLng: null, dropoffWalkMeters: null, respondedAt: null };
const REQUESTS = [
  { ...BOOKING_BASE, id: 'b-req1', rideId: 'r1', riderId: 'u-2', status: 'pending', requestedAt: iso(-25), expiresAt: iso(95), rider: rider('u-2', 'Sarra Trabelsi') },
  { ...BOOKING_BASE, id: 'b-req2', rideId: 'r1', riderId: 'u-3', status: 'accepted', seatsRequested: 1, requestedAt: iso(-200), respondedAt: iso(-180), expiresAt: null, pickupStopId: 's2', pickupLabel: 'Hammamet Nord, Rond-point', pickupLat: 36.40, pickupLng: 10.55, rider: rider('u-3', 'Youssef Gharbi') },
];
const rideSummary = (over) => ({ originLabel: 'La Marsa', destinationLabel: 'Nabeul', departureAt: iso(60*26), contributionPerSeat: 11, driverFullName: 'Mehdi Jaziri', driverUserId: 'u-d1', status: 'published', ...over });
const MY_BOOKINGS = [
  { ...BOOKING_BASE, id: 'b1', rideId: 'r9', riderId: 'u-me', status: 'accepted', contributionTotal: 11, pickupLabel: 'La Marsa, Plage', requestedAt: iso(-300), respondedAt: iso(-280), expiresAt: null, ride: rideSummary() },
  { ...BOOKING_BASE, id: 'b2', rideId: 'r8', riderId: 'u-me', status: 'pending', contributionTotal: 9, pickupLabel: 'Ariana, Ennasr', requestedAt: iso(-10), expiresAt: iso(110), ride: rideSummary({ originLabel: 'Ariana', destinationLabel: 'Bizerte', departureAt: iso(60*48), contributionPerSeat: 9, driverFullName: 'Ines Mansouri', driverUserId: 'u-d2' }) },
  { ...BOOKING_BASE, id: 'b3', rideId: 'r7', riderId: 'u-me', status: 'completed', contributionTotal: 16, pickupLabel: 'Tunis, Lac 2', requestedAt: iso(-60*24*8), respondedAt: iso(-60*24*8), expiresAt: null, ride: rideSummary({ originLabel: 'Tunis', destinationLabel: 'Monastir', departureAt: iso(-60*24*7), contributionPerSeat: 16, driverFullName: 'Karim Ayari', driverUserId: 'u-d3', status: 'completed' }) },
];
const cand = (i, over) => ({ rideId: 'rc' + i, driverUserId: 'u-d' + i, driverFullName: ['Mehdi Jaziri','Ines Mansouri','Karim Ayari','Nour Ben Ali'][i-1], driverAvatarUrl: null, ratingAvg: [4.9,4.6,4.2,5][i-1], tripCount: [58,12,4,0][i-1], departureAt: iso(60*(18+i)), seatsAvailable: [3,1,2,4][i-1], contributionPerSeat: [14,13,15,12][i-1], pickupWalkMinutes: [4,7,11,3][i-1], dropoffWalkMinutes: [3,5,2,6][i-1], routeOverlapPercent: [96,88,80,92][i-1], score: 0.9 - i*0.1, reasons: ['Départ proche', 'Même direction'], clusterLabel: 'Tunis → Sousse', originLat: 36.8065, originLng: 10.1815, destinationLat: 35.8256, destinationLng: 10.6084, routePolyline: POLY, rankedStops: [{ stopId: 's1', label: 'Ben Arous, Station Total', lat: 36.74, lng: 10.23, walkMinutes: 4 }, { stopId: 's2', label: 'Hammamet Nord, Rond-point', lat: 36.40, lng: 10.55, walkMinutes: 12 }], rankedDropoffStops: [], pickupViable: true, dropoffViable: true, matchType: i === 3 ? 'route_passthrough' : 'endpoint', detour: null, pickupEtaSeconds: i === 3 ? 900 : 0, dropoffEtaSeconds: 8400, detourRoutePolyline: null, ...over });
const SEARCH = { tier: 'exact', candidates: [cand(1), cand(2), cand(3), cand(4)], standoutRideId: 'rc1', message: null };
const conv = (id, bookingId, name, role, last, unread) => ({ id, bookingId, status: 'open', createdAt: iso(-300), updatedAt: iso(-5), viewerRole: role === 'driver' ? 'rider' : 'driver', otherParty: { id: 'u-' + id, fullName: name, avatarUrl: null }, otherPartyRole: role, isOtherPartyVerified: role === 'driver', rideId: 'r9', originLabel: 'La Marsa', destinationLabel: 'Nabeul', pickupLabel: 'La Marsa, Plage', dropoffLabel: 'Nabeul, Centre', departureAt: iso(60*26), rideStatus: 'published', tripStatus: 'scheduled', lastMessage: last ? { body: last, createdAt: iso(-5), senderUserId: 'u-' + id } : null, hasUnread: unread });
const CONVS = [conv('c1', 'b1', 'Mehdi Jaziri', 'driver', 'Je serai devant la pharmacie à 8h15.', true), conv('c2', 'b-req2', 'Youssef Gharbi', 'rider', 'Merci, à demain !', false)];
const MESSAGES = [
  { id: 'm1', conversationId: 'c1', senderUserId: 'u-me', body: 'Bonjour, je confirme pour demain matin.', createdAt: iso(-60) },
  { id: 'm2', conversationId: 'c1', senderUserId: 'u-c1', body: 'Parfait ! Vous avez un gros bagage ?', createdAt: iso(-50) },
  { id: 'm3', conversationId: 'c1', senderUserId: 'u-me', body: 'Juste un sac à dos.', createdAt: iso(-45) },
  { id: 'm4', conversationId: 'c1', senderUserId: 'u-c1', body: 'Je serai devant la pharmacie à 8h15.', createdAt: iso(-5) },
];
const notif = (id, type, payload, mins, read) => ({ id, userId: 'u-me', type, payload, readAt: read ? iso(mins + 1) : null, createdAt: iso(mins), updatedAt: iso(mins) });
const NOTIFS = [
  notif('n1', 'booking_accepted', { bookingId: 'b1', rideId: 'r9', driverName: 'Mehdi Jaziri' }, -20, false),
  notif('n2', 'booking_requested', { bookingId: 'b-req1', rideId: 'r1', riderName: 'Sarra Trabelsi' }, -25, false),
  notif('n3', 'message_received', { bookingId: 'b1', conversationId: 'c1', senderName: 'Mehdi Jaziri' }, -5, true),
  notif('n4', 'trip_completed', { bookingId: 'b3', tripId: 't3' }, -60*24*7, true),
];
const publicProfile = (id) => ({ id, fullName: 'Mehdi Jaziri', avatarUrl: null, driver: { bio: 'Ingénieur, je fais Tunis–Sousse chaque semaine. Musique douce, pas de fumée.', languages: ['fr', 'ar'], ratingAvg: 4.9, tripCount: 58, punctualityScore: 0.97, reliabilityScore: 0.98, vehicle: { make: 'Volkswagen', model: 'Golf 7', color: 'Blanc', photoUrl: null, plateNumber: '198 TU 3301' } } });
const TRUST = (id) => ({ userId: id, driver: { tier: 'top_rated', ratingAvg: 4.9, tripCount: 58, punctualityScore: 0.97 }, rider: { tier: 'trusted', ratingAvg: 4.7, tripCount: 9, punctualityScore: 0.9 } });
const PATTERNS = [{ id: 'p1', userId: 'u-me', role: 'rider', routeId: null, originLabel: 'Ariana', originLat: 36.86, originLng: 10.19, destinationLabel: 'Tunis, Lac 2', destinationLat: 36.84, destinationLng: 10.27, daysOfWeekMask: 31, timeWindowStart: '07:30', timeWindowEnd: '08:30', confidenceScore: 0.82, status: 'suggested', lastMatchedAt: null, createdAt: iso(-60*24*3), updatedAt: iso(-60*24*3), matchesToday: false, todayRideId: null }];
const TRIP = { id: 't1', bookingId: 'b1', rideId: 'r9', status: 'scheduled', simulationStartedAt: null, pickupConfirmedAt: null, dropoffAt: null, completedAt: null, riderSettlementConfirmedAt: null, driverSettlementConfirmedAt: null, startedAt: null };
const PREDICTIONS = [
  { placeId: 'pl1', primaryText: 'Sousse', secondaryText: 'Gouvernorat de Sousse', type: 'city' },
  { placeId: 'pl2', primaryText: 'Sousse Médina', secondaryText: 'Sousse', type: 'neighborhood' },
  { placeId: 'pl3', primaryText: 'Gare de Sousse', secondaryText: 'Avenue Habib Bourguiba, Sousse', type: 'poi' },
];

function defaultFixtures(opts = {}) {
  const o = { driver: true, ...opts };
  return [
    ['GET', /\/users\/me$/, () => ME],
    ['PATCH', /\/users\/me$/, () => ME],
    ['GET', /\/drivers\/me$/, () => (o.driver ? DRIVER : [404, { message: 'Not found' }])],
    ['GET', /\/rides\/mine$/, () => (o.driver ? [RIDE, { ...RIDE, id: 'r2', status: 'draft', originLabel: 'Tunis', destinationLabel: 'Bizerte', departureAt: iso(60*72), seatsAvailable: 3 }] : [])],
    ['GET', /\/rides\/[^/]+\/requests$/, () => REQUESTS],
    ['GET', /\/rides\/[^/]+\/stops/, () => STOPS],
    ['GET', /\/rides\/[^/]+\/fellow-passengers$/, () => [{ userId: 'u-3', firstName: 'Youssef', avatarUrl: null, ratingAvg: 4.7 }]],
    ['GET', /\/rides\/[^/]+\/city-detour-candidates$/, () => ({ cities: [], tripProfileType: 'intercity' })],
    ['GET', /\/rides\/[^/]+$/, () => RIDE],
    ['POST', /\/rides\/route-options$/, () => ({ options: [{ token: 'tk1', kind: 'fastest', label: 'Le plus rapide', distanceM: 142000, durationSec: 8400, polyline: POLY, isEstimate: false, hasTolls: true, recommended: true }, { token: 'tk2', kind: 'no_tolls', label: 'Sans péage', distanceM: 151000, durationSec: 9900, polyline: encodePolyline(ROUTE.map(([a,b]) => [a, b - 0.05])), isEstimate: false, hasTolls: false, recommended: false }] })],
    ['POST', /\/rides$/, () => ({ ...RIDE, status: 'draft', pricing: { min: 10, recommended: 14, max: 18 }, routeIsEstimate: false })],
    ['PATCH', /\/rides\/[^/]+$/, () => ({ ...RIDE, status: 'draft', pricing: { min: 10, recommended: 14, max: 18 }, routeIsEstimate: false })],
    ['POST', /\/rides\/[^/]+\/candidate-stops$/, () => ({ stops: STOPS, osrmUnavailable: false, regenerated: false, tripProfileType: 'intercity' })],
    ['GET', /\/bookings\/mine$/, () => (o.noBookings ? [] : MY_BOOKINGS)],
    ['GET', /\/bookings\/[^/]+\/trip$/, () => TRIP],
    ['GET', /\/bookings\/[^/]+\/cancellation-preview$/, () => ({ tier: 'moderate', minutesBeforeDeparture: 600, penaltyPoints: 1, consequence: 'Annulation à moins de 24 h : +1 point de fiabilité.' })],
    ['GET', /\/bookings\/[^/]+\/detour-preview$/, () => ({ pickup: { label: 'Ben Arous, Station Total', lat: 36.74, lng: 10.23, isPlannedStop: true, deviationMeters: 120, deviationSeconds: 40, stopIndex: 1, totalStops: 2 }, dropoff: { label: 'Sousse, Médina', lat: 35.8256, lng: 10.6084, isPlannedStop: true, deviationMeters: 0, deviationSeconds: 0, stopIndex: 2, totalStops: 2 }, segment: { distanceM: 130000, durationSec: 7800, isEstimate: false }, pickupTime: iso(60*20+10), dropoffTime: iso(60*22+20), newEta: iso(60*22+25), detourRoutePolyline: null })],
    ['GET', /\/bookings\/[^/]+\/contact-phone$/, () => ({ phone: null })],
    ['GET', /\/matching\/search/, () => (o.emptySearch ? { tier: 'none', candidates: [], standoutRideId: null, message: 'Aucun trajet trouvé pour cet itinéraire.' } : SEARCH)],
    ['GET', /\/geocoding\/autocomplete/, () => PREDICTIONS],
    ['GET', /\/geocoding\/place-details/, () => ({ placeId: 'pl1', label: 'Sousse', primaryText: 'Sousse', secondaryText: 'Gouvernorat de Sousse', latitude: 35.8256, longitude: 10.6084, type: 'city', formattedAddress: 'Sousse, Tunisie', city: 'Sousse', governorate: 'Sousse', countryCode: 'TN', source: 'google' })],
    ['GET', /\/geocoding\/reverse/, () => ({ label: 'Tunis, Centre-ville', lat: 36.8065, lng: 10.1815 })],
    ['GET', /\/notifications$/, () => NOTIFS],
    ['GET', /\/conversations$/, () => CONVS],
    ['GET', /\/conversations\/[^/]+\/messages/, () => MESSAGES],
    ['GET', /\/conversations\/[^/]+$/, () => CONVS[0]],
    ['GET', /\/users\/[^/]+\/trust-summary$/, (m) => TRUST(m[0])],
    ['GET', /\/users\/[^/]+$/, () => publicProfile('u-d1')],
    ['GET', /\/trips\/pending-rating$/, () => null],
    ['GET', /\/trips\/[^/]+\/tracking$/, () => ({ tripStatus: 'scheduled', trackingStatus: 'not_started', currentLat: null, currentLng: null, currentHeadingDeg: null, currentSpeedMps: null, locationUpdatedAt: null, routePolyline: POLY, pickup: { lat: 36.74, lng: 10.23, label: 'Ben Arous' }, destination: { lat: 35.8256, lng: 10.6084, label: 'Sousse' } })],
    ['POST', /\/trips\/[^/]+\/complete$/, () => ({ ...TRIP, status: 'completed', completedAt: iso(0) })],
    ['GET', /\/recurring-patterns$/, () => (o.patterns ? PATTERNS : [])],
    ['POST', /\/analytics\/events$/, () => ({ ok: true })],
    ['POST', /\/users\/me\/push-token$/, () => ({})],
    ['POST', /\/auth\/otp\/request$/, () => ({ sent: true })],
    ['POST', /\/auth\/otp\/verify$/, () => ({ accessToken: 'mock-access', refreshToken: 'mock-refresh' })],
    ['GET', /\/health$/, () => ({ status: 'ok' })],
  ];
}

function stubMaps(body) {
  const endRe = /\},(\d+),\[[\d,]*\],"[^"]*react-native-maps\/src\/index\.ts"\);/;
  const m = body.match(endRe);
  if (!m) return body;
  const end = m.index;
  const start = body.lastIndexOf('__d(function', end);
  const rid = body.match(/\},(\d+),\[[\d,]*\],"[^"]*\/node_modules\/react\/index\.js"\)/)[1];
  const rnw = body.match(/\},(\d+),\[[\d,]*\],"[^"]*react-native-web\/dist\/index\.js"\)/)[1];
  const stub = `__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  var React = __r(${rid}); var RN = __r(${rnw});
  class MapView extends React.Component {
    componentDidMount() { var f = this.props.onMapReady; if (f) setTimeout(function () { f(); }, 50); }
    animateToRegion() {} fitToCoordinates() {} animateCamera() {} setCamera() {} fitToElements() {} fitToSuppliedMarkers() {}
    getCamera() { return Promise.resolve({ center: { latitude: 36.8, longitude: 10.18 }, zoom: 10, heading: 0, pitch: 0 }); }
    render() { return React.createElement(RN.View, { style: [this.props.style, { backgroundColor: '#D6DED8', backgroundImage: 'linear-gradient(#c9d3cc 1px, transparent 1px), linear-gradient(90deg, #c9d3cc 1px, transparent 1px)', backgroundSize: '28px 28px' }] }); }
  }
  var Nil = function () { return null; };
  function AnimatedRegion(v) { Object.assign(this, v || {}); }
  AnimatedRegion.prototype.timing = function () { return { start: function (cb) { cb && cb(); } }; };
  AnimatedRegion.prototype.spring = AnimatedRegion.prototype.timing;
  AnimatedRegion.prototype.setValue = function (v) { Object.assign(this, v); };
  exports.__esModule = true; exports.default = MapView; exports.MapView = MapView;
  ['Marker','MarkerAnimated','Polyline','Polygon','Circle','Callout','CalloutSubview','Overlay','OverlayAnimated','Heatmap','UrlTile','WMSTile','LocalTile','Geojson'].forEach(function (k) { exports[k] = Nil; });
  exports.AnimatedRegion = AnimatedRegion; exports.PROVIDER_GOOGLE = 'google'; exports.PROVIDER_DEFAULT = undefined;
${m[0]}`;
  return body.slice(0, start) + stub + body.slice(end + m[0].length);
}

async function open({ signedIn = true, scheme = 'light', locale = 'fr-FR', fixtures = {}, width = 390, height = 844 } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, locale, geolocation: { latitude: 36.8065, longitude: 10.1815 }, permissions: ['geolocation'] });
  const unmocked = new Set();
  const consoleErrors = [];
  const routes = defaultFixtures(fixtures);

  await context.addInitScript(({ signedIn }) => {
    if (signedIn) { localStorage.setItem('ss:vaya.accessToken', 'mock-access'); localStorage.setItem('ss:vaya.refreshToken', 'mock-refresh'); }
    localStorage.setItem('ss:vaya.pushPermissionPrompted', 'true');
    globalThis.__cgnc = () => function NativeMapStub() { return null; };
    globalThis.__cgncmd = () => new Proxy({}, { get: () => () => {} });
  }, { signedIn });

  // Patch the empty expo-secure-store web module with a localStorage shim.
  await context.route('**/*.bundle?*', async (route) => {
    const resp = await route.fetch();
    let body = await resp.text();
    body = body.replace(/var _default = \{\};(\s*\},\d+,\[\],"[^"]*ExpoSecureStore\.web\.js")/, `var _default = {
      getValueWithKeyAsync: async (k) => localStorage.getItem('ss:' + k),
      getValueWithKeySync: (k) => localStorage.getItem('ss:' + k),
      setValueWithKeyAsync: async (v, k) => localStorage.setItem('ss:' + k, v),
      setValueWithKeySync: (v, k) => localStorage.setItem('ss:' + k, v),
      deleteValueWithKeyAsync: async (k) => localStorage.removeItem('ss:' + k),
      canUseBiometricAuthentication: () => false,
    };$1`);
    body = stubMaps(body);
    body = body.split('LogBoxData.addLog(').join('(function(){})(').split('LogBoxData.addException(').join('(function(){})(');
    body = body.replace(/throw new _expoModulesCore\.UnavailabilityError\('Notifications', '[A-Za-z]+'\);/g, 'return null;');
    body = body.split('(0, _reactNativeWebDistIndex.codegenNativeComponent)').join('(0, globalThis.__cgnc)').split('(0, _reactNativeWebDistIndex.codegenNativeCommands)').join('(0, globalThis.__cgncmd)');
    await route.fulfill({ response: resp, body, headers: { ...resp.headers(), 'content-length': String(Buffer.byteLength(body)) } });
  });

  await context.route('http://vaya-mock.test/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname.replace('/api/v1', '');
    if (fixtures.delayMs) await new Promise((r) => setTimeout(r, fixtures.delayMs));
    if (fixtures.fail && fixtures.fail.test(p)) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Internal error' }) });
    for (const [method, re, fn] of routes) {
      const m = p.match(re);
      if (req.method() === method && m) {
        let res = fn(m, url);
        let status = 200;
        if (Array.isArray(res) && typeof res[0] === 'number') { status = res[0]; res = res[1]; }
        return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(res) });
      }
    }
    unmocked.add(`${req.method()} ${p}`);
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'unmocked' }) });
  });
  // Block anything else external (maps tiles, sentry, fonts CDNs are allowed through only if local).
  await context.route(/^https?:\/\/(?!localhost|vaya-mock\.test)/, (route) => {
    const u = route.request().url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.continue();
    return route.abort();
  });

  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + String(e).slice(0, 300)));

  const shot = async (name, opts = {}) => {
    await page.waitForTimeout(opts.wait ?? 900);
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!opts.full });
    console.log('shot', name);
  };
  const go = async (route, wait = 2500) => {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(wait);
  };
  const done = async () => {
    console.log('UNMOCKED:', [...unmocked].join(' | ') || 'none');
    const errs = [...new Set(consoleErrors)].filter((e) => !/Failed to load resource|ERR_FAILED/.test(e));
    console.log('CONSOLE ERRORS:', errs.length ? '\n  ' + errs.slice(0, 15).join('\n  ') : 'none');
    await browser.close();
  };
  return { page, shot, go, done };
}

module.exports = { open, BASE, OUT };
