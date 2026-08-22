import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(dirname, '../../app');
const designSystemDir = path.resolve(dirname, '../../../../packages/design-system/src/primitives');

function read(relativePath: string): string {
  return readFileSync(path.join(appDir, relativePath), 'utf-8');
}

/**
 * Source-level regression guard (same rationale as
 * notification-foreground-and-permission-timing.test.ts — no component
 * render harness exists in this repo). Encodes the fix for "swiping right
 * inside the calendar bottom sheet dismissed the entire app":
 *
 *  1. (tabs)/_layout.tsx must register a beforeRemove listener that
 *     preventDefault()s any pop attempt targeting the tabs screen — a
 *     system back event (Android gesture nav edge swipe) must never land
 *     the app back on the landing/auth screen;
 *  2. programmatic router.replace('/' ) on sign-out dispatches REPLACE and
 *     must stay allowed through that same guard;
 *  3. BottomSheet must consume hardware back while open, so a back event
 *     closes only the sheet.
 */
describe('(tabs) back-pop guard', () => {
  it('tabs layout swallows beforeRemove pops so system back can never reach landing', () => {
    const source = read('(tabs)/_layout.tsx');
    expect(source).toContain("addListener('beforeRemove'");
    expect(source).toContain('preventDefault()');
    expect(source).not.toContain("router.back()");
  });

  it('the guard still allows REPLACE actions (sign-out redirect to /)', () => {
    const source = read('(tabs)/_layout.tsx');
    const guardIndex = source.indexOf("addListener('beforeRemove'");
    const replaceIndex = source.indexOf("=== 'REPLACE'", guardIndex);
    const preventIndex = source.indexOf('preventDefault()', guardIndex);
    expect(replaceIndex).toBeGreaterThan(-1);
    // The REPLACE exemption must be evaluated before preventDefault runs.
    expect(replaceIndex).toBeLessThan(preventIndex);
  });

  it('BottomSheet consumes hardware back while open so back closes the sheet only', () => {
    const source = readFileSync(path.join(designSystemDir, 'BottomSheet.tsx'), 'utf-8');
    expect(source).toContain('BackHandler.addEventListener');
    expect(source).toContain('isDismissalDrag');
  });
});
