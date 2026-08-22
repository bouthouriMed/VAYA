import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const primitivesDir = path.resolve(dirname, '../primitives');

function read(name: string): string {
  return readFileSync(path.join(primitivesDir, name), 'utf-8');
}

/**
 * Source-level regression guard for "swiping right in the calendar
 * dismissed the entire app" (iOS: silent process kill, bounce to home
 * screen). Root cause: DateCalendarSheet.settleGrid was called from the
 * auto-workletized monthSwipeGesture.onEnd but wasn't itself marked
 * 'worklet', so it (and the React setState inside goToMonth it reached)
 * executed on the UI thread — an exception there has no redbox; on
 * iOS/Fabric it kills the process outright. The guard pins the two
 * requirements:
 *  1. settleGrid carries the 'worklet' directive;
 *  2. goToMonth is only ever invoked through runOnJS.
 */
describe('DateCalendarSheet month-swipe UI-thread safety', () => {
  const source = read('DateCalendarSheet.tsx');

  it('settleGrid is explicitly marked as a worklet', () => {
    const fnIndex = source.indexOf('function settleGrid(');
    expect(fnIndex).toBeGreaterThan(-1);
    const bodyStart = source.indexOf('{', fnIndex);
    const body = source.slice(bodyStart, bodyStart + 200);
    expect(body).toMatch(/'worklet'/);
  });

  it('the month-swipe callbacks never reach goToMonth except through runOnJS', () => {
    // The chevron buttons' onPress handlers legitimately call goToMonth
    // directly — those run on the JS thread. Only the gesture callback
    // block (which runs as a UI-thread worklet) must be free of it.
    expect(source).toContain('runOnJS(goToMonth)');
    const onEndIndex = source.indexOf('.onEnd((e, success)');
    expect(onEndIndex).toBeGreaterThan(-1);
    const blockEnd = source.indexOf('const gridAnimatedStyle', onEndIndex);
    const gestureBlock = source.slice(onEndIndex, blockEnd);
    expect(gestureBlock).toMatch(/settleGrid\(/);
    // Comment lines may legitimately mention goToMonth (the clamp note) —
    // only executable lines are checked.
    const codeOnly = gestureBlock
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(codeOnly).not.toMatch(/goToMonth\(/);
  });
});
