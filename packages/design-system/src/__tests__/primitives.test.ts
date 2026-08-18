import { describe, it, expect } from 'vitest';

describe('Design system primitives', () => {
  it('exports all primitive components', async () => {
    const primitives = await import('../primitives/index.js');
    expect(primitives.Text).toBeDefined();
    expect(primitives.Button).toBeDefined();
    expect(primitives.Input).toBeDefined();
    expect(primitives.Card).toBeDefined();
    expect(primitives.Badge).toBeDefined();
    expect(primitives.Avatar).toBeDefined();
    expect(primitives.Divider).toBeDefined();
    expect(primitives.Stack).toBeDefined();
    expect(primitives.Row).toBeDefined();
    expect(primitives.Screen).toBeDefined();
    expect(primitives.Container).toBeDefined();
  });

  it('exports main index with all tokens', async () => {
    const index = await import('../index.js');
    expect(index.colors).toBeDefined();
    expect(index.spacing).toBeDefined();
    expect(index.radii).toBeDefined();
    expect(index.typography).toBeDefined();
  });
});
