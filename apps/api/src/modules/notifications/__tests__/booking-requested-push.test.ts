import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { getDatabase } from '../../../lib/database.js';
import { dispatchPushForNotification } from '../notifications.service.js';
import { composeNotification, requestFacts } from '../notification-copy.js';

type Database = ReturnType<typeof getDatabase>;

// Phase 14: the driver decides from the push itself — who, where, what it
// costs them, what it pays — with the passenger's photo beside it.
const PAYLOAD = {
  bookingId: 'b1',
  rideId: 'r1',
  riderName: 'Amira Ben Salah',
  riderAvatarUrl: 'https://cdn.vaya.tn/public/avatars/amira.jpg',
  seatsRequested: 1,
  originLabel: 'Sidi Hassine',
  destinationLabel: 'El Mourouj',
  contributionTotal: 4.5,
  detourExtraSeconds: 190,
};

function fakeDb(payload: Record<string, unknown>): Database {
  return {
    query: {
      notifications: {
        findFirst: async () => ({ id: 'n1', userId: 'u1', type: 'booking_requested', payload }),
      },
      deviceTokens: {
        findMany: async () => [{ id: 'dt1', userId: 'u1', token: 'ExponentPushToken[x]', platform: 'android' }],
      },
      users: { findFirst: async () => ({ id: 'u1', locale: 'fr' }) },
      bookings: { findFirst: async () => undefined },
      rides: { findFirst: async () => undefined },
    },
  } as unknown as Database;
}

async function sentMessage(payload: Record<string, unknown>) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) });
  vi.stubGlobal('fetch', fetchMock);
  await dispatchPushForNotification(fakeDb(payload), 'n1');
  return JSON.parse(fetchMock.mock.calls[0]![1].body as string)[0];
}

describe('booking_requested push', () => {
  beforeEach(() => vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/test'));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('says where, extra minutes and price', async () => {
    const message = await sentMessage(PAYLOAD);
    expect(message.body).toContain('Sidi Hassine → El Mourouj · +3 min de détour · 4,5 DT.');
  });

  it("attaches the passenger's photo as the notification image", async () => {
    const message = await sentMessage(PAYLOAD);
    expect(message.richContent).toEqual({ image: PAYLOAD.riderAvatarUrl });
    expect(message.mutableContent).toBe(true);
  });

  it('attaches no image without a public https photo', async () => {
    expect((await sentMessage({ ...PAYLOAD, riderAvatarUrl: undefined })).richContent).toBeUndefined();
    expect((await sentMessage({ ...PAYLOAD, riderAvatarUrl: 'http://localhost:3000/a.jpg' })).richContent).toBeUndefined();
  });
});

describe('requestFacts', () => {
  it('says "Sur votre trajet" when the request costs the driver no detour', () => {
    expect(requestFacts({ ...PAYLOAD, detourExtraSeconds: 20 }, 'fr')).toBe(
      'Sidi Hassine → El Mourouj · Sur votre trajet · 4,5 DT',
    );
  });

  it('leaves out an unknown detour rather than showing 0', () => {
    const payload: Record<string, unknown> = { ...PAYLOAD };
    delete payload.detourExtraSeconds;
    expect(requestFacts(payload, 'fr')).toBe('Sidi Hassine → El Mourouj · 4,5 DT');
  });

  it('is localized', () => {
    expect(requestFacts(PAYLOAD, 'en')).toBe('Sidi Hassine → El Mourouj · +3 min detour · 4.5 DT');
  });

  it('adds nothing for an old payload without the leg', () => {
    const text = composeNotification('booking_requested', { riderName: 'Amira' }, { seats: 1 }, 'fr');
    expect(text.body).toBe('Amira demande 1 place.');
  });
});
