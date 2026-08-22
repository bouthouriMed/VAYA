import React from 'react';
import { describe, it, expect } from 'vitest';
import { DateCalendarSheet } from '../primitives/DateCalendarSheet';
import { TimeWheelSheet } from '../primitives/TimeWheelSheet';
import { renderJSON } from './test-utils/renderJSON';

/**
 * Real react-test-renderer snapshots of the two Stitch-matched date/time
 * pickers (stitch/search_flow/calendar-selection-b.html and
 * search-time-selection.html) that replaced the day-chip/time-chip-grid
 * BottomSheet for explore.tsx's Date/Heure fields. `DepartureTimeSheet`
 * itself is untouched and still backs driver/publish.tsx — not
 * snapshotted again here, no behavior of it changed.
 */

describe('DateCalendarSheet snapshots', () => {
  it('renders the month grid with the given value selected', () => {
    const tree = renderJSON(
      <DateCalendarSheet
        visible
        onClose={() => {}}
        value={new Date(2026, 10, 9, 18, 30)}
        onChange={() => {}}
      />,
    );
    expect(tree).toMatchSnapshot();
  });

  it('renders nothing while not visible', () => {
    const tree = renderJSON(
      <DateCalendarSheet
        visible={false}
        onClose={() => {}}
        value={new Date(2026, 10, 9)}
        onChange={() => {}}
      />,
    );
    expect(tree).toBeNull();
  });
});

describe('TimeWheelSheet snapshots', () => {
  it('renders the hour:minute wheel with the given value centered', () => {
    const tree = renderJSON(
      <TimeWheelSheet visible onClose={() => {}} value={new Date(2026, 10, 9, 18, 30)} onChange={() => {}} />,
    );
    expect(tree).toMatchSnapshot();
  });
});
