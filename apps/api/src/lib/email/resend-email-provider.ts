import type { EmailMessage, EmailProvider } from './email-provider.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Direct HTTP call to Resend's API rather than an SDK dependency — the same
 * "dependency-free, plain fetch to the provider's HTTP API" choice Phase 7
 * made for Expo push (notifications/expo-push.ts) for the same reason: this
 * dispatch path only ever needs a plain send, no template management or
 * batch/webhook features an SDK would add.
 *
 * Throws on any transport failure or non-OK response so the caller (the
 * BullMQ notification-dispatch job) fails and its native retry picks it up —
 * must only ever be called from the dispatch worker, never inline in a
 * request handler.
 */
export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async sendEmail(message: EmailMessage): Promise<void> {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Resend API responded with HTTP ${response.status}: ${body}`);
    }
  }
}
