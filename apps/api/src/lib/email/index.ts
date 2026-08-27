import { getEnv } from '../../config/env.js';
import { DevEmailProvider } from './dev-email-provider.js';
import { ResendEmailProvider } from './resend-email-provider.js';
import type { EmailProvider } from './email-provider.js';

export type { EmailProvider, EmailMessage } from './email-provider.js';

let _email: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!_email) {
    const env = getEnv();
    _email = env.RESEND_API_KEY
      ? new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM)
      : new DevEmailProvider();
  }
  return _email;
}
