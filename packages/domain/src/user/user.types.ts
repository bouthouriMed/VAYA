import type { TimestampedEntity } from '../shared/base.types.js';
import type { SupportedLocale } from '@vaya/config';

export interface User extends TimestampedEntity {
  phone: string;
  fullName: string;
  avatarUrl: string | null;
  locale: SupportedLocale;
}
