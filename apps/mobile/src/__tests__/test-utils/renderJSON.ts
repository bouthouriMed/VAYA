import type React from 'react';
import renderer, { act, type ReactTestRendererJSON } from 'react-test-renderer';

/**
 * React 19's react-test-renderer schedules the initial render on the
 * concurrent scheduler — reading `.toJSON()` immediately after
 * `renderer.create()` (no `act()`) returns `null` because nothing has
 * committed yet. `.toJSON()` must also run *after* act()'s callback
 * returns (act() only flushes once the callback finishes) — reading it
 * from inside sees the pre-commit tree and silently returns null too.
 */
export function renderJSON(
  element: React.ReactElement,
): ReactTestRendererJSON | ReactTestRendererJSON[] | null {
  let instance: renderer.ReactTestRenderer;
  act(() => {
    instance = renderer.create(element);
  });
  return instance!.toJSON();
}
