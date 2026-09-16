/**
 * RN 0.85+ removed `StyleSheet.absoluteFillObject` (a plain, spreadable
 * object) in favor of `StyleSheet.absoluteFill` (a registered style
 * reference that composes fine as a `style` value but can't be spread into
 * another object literal). Internal to this package — primitives spreading
 * the four inset properties into a combined style object need this; anyone
 * just passing a lone/array style value should use `StyleSheet.absoluteFill`
 * directly instead.
 */
export const ABSOLUTE_FILL_OBJECT = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
} as const;
