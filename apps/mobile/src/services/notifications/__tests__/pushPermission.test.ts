import { describe, it, expect } from 'vitest';
import { shouldPromptForPushPermission } from '../pushPermission';

describe('shouldPromptForPushPermission', () => {
  it('prompts when the user has never been asked before', () => {
    expect(shouldPromptForPushPermission(false)).toBe(true);
  });

  it('does not prompt again once already asked this install', () => {
    expect(shouldPromptForPushPermission(true)).toBe(false);
  });
});
