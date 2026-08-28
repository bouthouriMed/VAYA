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
 * Same crash class documented in date-calendar-worklet-safety.test.ts: a
 * plain JS function called directly from a UI-thread worklet (a gesture
 * callback, or here a `useAnimatedScrollHandler`'s `onScroll`) with no
 * `'worklet'` directive and no `runOnJS` wrapper has no redbox on iOS — the
 * process is silently killed. TimeWheelSheet's live-tick haptic
 * (`haptics.selection()`, fired from inside the scroll handler as the
 * centered index changes) is exactly this shape, so it gets the same
 * regression guard rather than trusting a future edit not to "simplify" it
 * back into a direct call.
 */
describe('TimeWheelSheet scroll-handler UI-thread safety', () => {
  const source = read('TimeWheelSheet.tsx');

  it('the useAnimatedScrollHandler onScroll callback only reaches haptics.selection via runOnJS', () => {
    const handlerIndex = source.indexOf('useAnimatedScrollHandler({');
    expect(handlerIndex).toBeGreaterThan(-1);
    const blockEnd = source.indexOf('function handleSettle', handlerIndex);
    const handlerBlock = source.slice(handlerIndex, blockEnd);

    expect(handlerBlock).toContain('runOnJS(haptics.selection)()');
    // Guards against the exact regression: a direct, unwrapped call sitting
    // alongside (or replacing) the runOnJS-wrapped one.
    const codeOnly = handlerBlock
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(codeOnly).not.toMatch(/[^(]haptics\.selection\(\)/);
  });

  it('scrollY and lastTickIndex are only ever assigned inside the worklet, never read/written from plain JS callbacks', () => {
    // handleSettle/onMomentumScrollEnd/onScrollEndDrag run on the JS thread
    // (they're plain RN event props, not part of the reanimated scroll
    // handler) and must never touch a shared value directly from there —
    // that's a real bridge/thread-safety footgun distinct from the crash
    // above, easy to reintroduce by "helpfully" reading scrollY.value in a
    // JS-thread callback for some future feature.
    const settleIndex = source.indexOf('function handleSettle(');
    expect(settleIndex).toBeGreaterThan(-1);
    const nextFnIndex = source.indexOf('\n  return (', settleIndex);
    const settleBlock = source.slice(settleIndex, nextFnIndex);
    expect(settleBlock).not.toMatch(/scrollY\.value/);
    expect(settleBlock).not.toMatch(/lastTickIndex\.value/);
  });
});
