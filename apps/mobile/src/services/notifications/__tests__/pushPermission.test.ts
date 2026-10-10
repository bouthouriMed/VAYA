import { describe, it, expect } from 'vitest';
import { shouldPromptForPushPermission } from '../pushPermission';

describe('shouldPromptForPushPermission', () => {
  it('prompts when the OS says the user has never answered', () => {
    expect(shouldPromptForPushPermission('undetermined' as never)).toBe(true);
  });

  it('never re-prompts after a grant or a refusal, or where push is unavailable', () => {
    expect(shouldPromptForPushPermission('granted' as never)).toBe(false);
    expect(shouldPromptForPushPermission('denied' as never)).toBe(false);
    expect(shouldPromptForPushPermission('unavailable')).toBe(false);
  });
});
