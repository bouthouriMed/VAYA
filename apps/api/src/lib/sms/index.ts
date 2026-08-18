import { DevSmsProvider } from './dev-sms-provider.js';
import type { SmsProvider } from './sms-provider.js';

export type { SmsProvider };

let _sms: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (!_sms) {
    _sms = new DevSmsProvider();
  }
  return _sms;
}
