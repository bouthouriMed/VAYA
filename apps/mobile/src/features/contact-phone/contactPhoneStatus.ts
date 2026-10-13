import type { Me } from '../../state/api';

/** Whether a counterpart could already reach this user by phone — either the
 *  OTP-verified login number or one they typed in themselves. */
export function hasReachablePhone(
  me: Pick<Me, 'phone' | 'contactPhone'> | null | undefined,
): boolean {
  return Boolean(me?.phone || me?.contactPhone);
}
