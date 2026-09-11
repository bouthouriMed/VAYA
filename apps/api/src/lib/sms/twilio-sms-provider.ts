import type { SmsProvider } from './sms-provider.js';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/**
 * Direct HTTP call to Twilio's REST API rather than an SDK dependency — the
 * same "dependency-free, plain fetch to the provider's HTTP API" choice this
 * codebase already made for Resend (lib/email/resend-email-provider.ts) and
 * Expo push (notifications/expo-push.ts): this dispatch path only ever needs
 * a single plain send, no template management or webhook features an SDK
 * would add.
 *
 * Throws on any transport failure or non-2xx response so the caller (the OTP
 * request route) can surface a real error instead of silently pretending the
 * SMS was sent.
 */
export class TwilioSmsProvider implements SmsProvider {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
  ) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    const url = `${TWILIO_API_BASE}/Accounts/${this.accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: phone,
      From: this.fromNumber,
      Body: `Your VAYA verification code is ${code}. It expires in 5 minutes.`,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new Error(`Twilio API responded with HTTP ${response.status}: ${responseBody}`);
    }
  }
}
