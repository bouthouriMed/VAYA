import React from 'react';
import { describe, expect, it } from 'vitest';
import { PhoneInput, toTunisianE164 } from '../primitives/PhoneInput';
import { renderJSON } from './test-utils/renderJSON';

type Node = { type: string; props: Record<string, unknown>; children?: (Node | string)[] };

function find(node: Node | string, type: string): Node | null {
  if (typeof node === 'string') return null;
  if (node.type === type) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, type);
    if (hit) return hit;
  }
  return null;
}

describe('PhoneInput', () => {
  it('renders the +216 pill and a phone-pad field with an accessible label', () => {
    const tree = renderJSON(
      <PhoneInput
        value="22 123 456"
        onChangeText={() => {}}
        accessibilityLabel="Numéro de téléphone"
      />,
    ) as Node;
    expect(JSON.stringify(tree)).toContain('+216');
    const input = find(tree, 'TextInput');
    expect(input?.props.keyboardType).toBe('phone-pad');
    expect(input?.props.accessibilityLabel).toBe('Numéro de téléphone');
    expect(input?.props.value).toBe('22 123 456');
  });

  it('shows the error under the field', () => {
    const tree = renderJSON(
      <PhoneInput value="12" onChangeText={() => {}} error="Numéro invalide" />,
    ) as Node;
    expect(JSON.stringify(tree)).toContain('Numéro invalide');
  });
});

describe('toTunisianE164', () => {
  it('builds the full number from 8 local digits, ignoring spacing', () => {
    expect(toTunisianE164('22 123 456')).toBe('+21622123456');
    expect(toTunisianE164('22-123-456')).toBe('+21622123456');
  });

  it('accepts a pasted number that already carries the country code', () => {
    expect(toTunisianE164('+216 22 123 456')).toBe('+21622123456');
    expect(toTunisianE164('21622123456')).toBe('+21622123456');
  });

  it('returns null for an incomplete or too-long number', () => {
    expect(toTunisianE164('2212345')).toBeNull();
    expect(toTunisianE164('221234567')).toBeNull();
    expect(toTunisianE164('')).toBeNull();
  });
});
