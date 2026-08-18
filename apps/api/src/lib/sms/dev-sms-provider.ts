import { getLogger } from '../../config/logger.js';
import type { SmsProvider } from './sms-provider.js';

/** Logs the OTP instead of sending a real SMS. No SMS provider account is wired up yet. */
export class DevSmsProvider implements SmsProvider {
  async sendOtp(phone: string, code: string): Promise<void> {
    getLogger().info({ phone, code }, `[dev-sms] OTP for ${phone}: ${code}`);
  }
}
