import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(dirname, '../../app');

function readScreen(relativePath: string): string {
  return readFileSync(path.join(appDir, relativePath), 'utf-8');
}

// No React Native component-rendering harness exists in this repo yet
// (no @testing-library/react-native, environment: 'node' in
// vitest.config.ts) — introducing one is a bigger undertaking than this
// bug-fix phase warrants. This is a source-level regression guard instead:
// it directly encodes the bug that was fixed (booking-confirmation screens
// silently rendering mock data after a real API call succeeded — see
// docs/product/audit.md §4) so it can't quietly come back.
describe('booking flow screens render real data, not mocks', () => {
  const screens = ['bookings/pending.tsx', 'bookings/pickup.tsx', 'bookings/settlement.tsx'];

  it.each(screens)('%s does not import from src/mocks/seed-data', (screen) => {
    const source = readScreen(screen);
    expect(source).not.toMatch(/from ['"].*mocks\/seed-data['"]/);
  });

  it('pending.tsx renders the pickup label from route params, not a hardcoded string', () => {
    const source = readScreen('bookings/pending.tsx');
    expect(source).toContain('params.pickupLabel');
  });

  it('pickup.tsx renders the pickup label from route params, not a hardcoded string', () => {
    const source = readScreen('bookings/pickup.tsx');
    expect(source).toContain('params.pickupLabel');
  });

  it('settlement.tsx renders the destination from route params, not a hardcoded string', () => {
    const source = readScreen('bookings/settlement.tsx');
    expect(source).toContain('destinationLabel');
  });

  it('ride-details.tsx forwards the real booking pickup label and ride destination when creating a booking', () => {
    const source = readFileSync(path.join(appDir, 'search/ride-details.tsx'), 'utf-8');
    expect(source).toContain('pickupLabel: booking.pickupLabel');
    expect(source).toContain('destinationLabel: ride!.destinationLabel');
  });
});
