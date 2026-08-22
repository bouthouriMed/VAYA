import type React from 'react';
import renderer, { act, type ReactTestRendererJSON } from 'react-test-renderer';

/**
 * React 19's react-test-renderer schedules the initial render on the
 * concurrent scheduler — reading `.toJSON()` immediately after
 * `renderer.create()` (no `act()`) returns `null` because nothing has
 * committed yet. Wrapping in `act()` flushes the commit synchronously.
 */
export function renderJSON(
  element: React.ReactElement,
): ReactTestRendererJSON | ReactTestRendererJSON[] | null {
  let instance: renderer.ReactTestRenderer;
  // .toJSON() must run after act()'s callback returns — act() only flushes
  // the commit once the callback finishes, so reading it from inside (as an
  // earlier version of this helper did) sees the pre-commit tree and
  // silently returns null instead of throwing.
  act(() => {
    instance = renderer.create(element);
  });
  return instance!.toJSON();
}
