export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>;
}
