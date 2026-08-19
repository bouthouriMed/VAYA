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

  it('exports the Phase 2 interaction-layer primitives', async () => {
    const primitives = await import('../primitives/index.js');
    expect(primitives.BottomSheet).toBeDefined();
    expect(primitives.Modal).toBeDefined();
    expect(primitives.ToastProvider).toBeDefined();
    expect(primitives.useToast).toBeDefined();
    expect(primitives.SkeletonBlock).toBeDefined();
    expect(primitives.SkeletonCircle).toBeDefined();
    expect(primitives.SkeletonText).toBeDefined();
    expect(primitives.EmptyState).toBeDefined();
    expect(primitives.Icon).toBeDefined();
  });

  it('exports the Phase 6 bounded price control', async () => {
    const primitives = await import('../primitives/index.js');
    expect(primitives.PriceRangeStepper).toBeDefined();
    expect(primitives.clampPrice).toBeDefined();
  });

  it('exports the Phase 8 chat bubble', async () => {
    const primitives = await import('../primitives/index.js');
    expect(primitives.MessageBubble).toBeDefined();
  });

  it('exports the Phase 9 star-rating input', async () => {
    const primitives = await import('../primitives/index.js');
    expect(primitives.StarRatingInput).toBeDefined();
  });

  it('exports the driver-flow visual-refresh primitives', async () => {
    const primitives = await import('../primitives/index.js');
    expect(primitives.ScreenHeader).toBeDefined();
    expect(primitives.RoutePulseBadge).toBeDefined();
  });

  it('exports the departure date/time picker sheet', async () => {
    const primitives = await import('../primitives/index.js');
    expect(primitives.DepartureTimeSheet).toBeDefined();
  });

  it('exports haptics from the package root', async () => {
    const index = await import('../index.js');
    expect(index.haptics).toBeDefined();
    expect(typeof index.haptics.success).toBe('function');
    expect(typeof index.haptics.selection).toBe('function');
    expect(typeof index.haptics.warning).toBe('function');
    expect(typeof index.haptics.error).toBe('function');
  });

  it('exports main index with all tokens', async () => {
    const index = await import('../index.js');
    expect(index.colors).toBeDefined();
    expect(index.spacing).toBeDefined();
    expect(index.radii).toBeDefined();
    expect(index.typography).toBeDefined();
  });
});
