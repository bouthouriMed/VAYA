import { getEnv } from '../../config/env.js';
import { DevSmsProvider } from './dev-sms-provider.js';
import { TwilioSmsProvider } from './twilio-sms-provider.js';
import type { SmsProvider } from './sms-provider.js';

export type { SmsProvider };

let _sms: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (!_sms) {
    const env = getEnv();
    _sms =
      env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER
        ? new TwilioSmsProvider(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_FROM_NUMBER)
        : new DevSmsProvider();
  }
  return _sms;
}
