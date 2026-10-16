import { describe, it, expect } from 'vitest';
import type React from 'react';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { RatingBreakdown, starShape } from '../primitives/RatingBreakdown';
import { VerificationSeal } from '../primitives/VerificationSeal';
import { LicensePlate, parseTunisianPlate } from '../primitives/LicensePlate';
import { FactRow } from '../primitives/FactRow';

function render(element: React.ReactElement): ReactTestInstance {
  let instance: renderer.ReactTestRenderer;
  act(() => {
    instance = renderer.create(element);
  });
  return instance!.root;
}

function texts(root: ReactTestInstance): string[] {
  return root
    .findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string')
    .map((n) => n.props.children as string);
}

describe('RatingBreakdown', () => {
  it('rounds stars to whole/half/empty', () => {
    expect([0, 1, 2, 3, 4].map((i) => starShape(4.6, i))).toEqual(['star', 'star', 'star', 'star', 'star-half']);
    expect(starShape(4.8, 4)).toBe('star');
    expect(starShape(3.1, 3)).toBe('star-outline');
  });

  it('is one labelled summary with a bar per star value', () => {
    const root = render(
      <RatingBreakdown
        average={4.7}
        averageLabel="4,7"
        countLabel="12 avis"
        starCounts={[0, 0, 1, 2, 9]}
        accessibilityLabel="Note moyenne 4,7 sur 5, 12 avis"
      />,
    );
    const summary = root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'summary');
    expect(summary).toHaveLength(1);
    expect(summary[0]!.props.accessibilityLabel).toContain('12 avis');
    for (const star of [1, 2, 3, 4, 5]) {
      expect(root.findAll((n) => typeof n.type === 'string' && n.props.testID === `rating-bar-${star}`)).toHaveLength(1);
    }
    expect(texts(root)).toContain('4,7');
  });
});

describe('VerificationSeal', () => {
  it('renders one labelled seal per passed check', () => {
    const root = render(
      <VerificationSeal
        checks={[
          { icon: 'person-outline', label: 'Identité' },
          { icon: 'card-outline', label: 'Permis' },
        ]}
        accessibilityLabel="Vérifié par VAYA : Identité, Permis"
      />,
    );
    expect(texts(root)).toEqual(expect.arrayContaining(['Identité', 'Permis']));
    const [summary] = root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'summary');
    expect(summary!.props.accessibilityLabel).toContain('Permis');
  });
});

describe('LicensePlate', () => {
  it('splits a standard Tunisian plate around تونس', () => {
    expect(parseTunisianPlate('208 TU 3333')).toEqual({ serial: '208', number: '3333' });
    expect(parseTunisianPlate('123 تونس 4567')).toEqual({ serial: '123', number: '4567' });
    expect(parseTunisianPlate('RS 12345')).toBeNull();
    const root = render(<LicensePlate plate="208 TU 3333" accessibilityLabel="Plaque 208 TU 3333" />);
    expect(texts(root)).toEqual(['208', 'تونس', '3333']);
  });

  it('shows a non-standard plate verbatim', () => {
    const root = render(<LicensePlate plate="RS 12345" accessibilityLabel="Plaque RS 12345" />);
    expect(texts(root)).toEqual(['RS 12345']);
  });
});

describe('FactRow lg', () => {
  it('labels each headline number for screen readers', () => {
    const root = render(
      <FactRow
        size="lg"
        facts={[
          { value: '4,8', icon: 'star', caption: '31 avis' },
          { value: '40', caption: 'trajets' },
        ]}
      />,
    );
    const labels = root
      .findAll((n) => typeof n.type === 'string' && n.props.accessible === true)
      .map((n) => n.props.accessibilityLabel as string);
    expect(labels).toEqual(['4,8 31 avis', '40 trajets']);
  });
});
