import { getLogger } from '../../config/logger.js';
import type { EmailMessage, EmailProvider } from './email-provider.js';

/** Logs the email instead of sending a real one. No email provider account
 *  is wired up yet — mirrors DevSmsProvider (lib/sms/dev-sms-provider.ts). */
export class DevEmailProvider implements EmailProvider {
  async sendEmail(message: EmailMessage): Promise<void> {
    getLogger().info(
      { to: message.to, subject: message.subject, text: message.text },
      `[dev-email] "${message.subject}" -> ${message.to}`,
    );
  }
}
