import { z } from 'zod';

export { z };

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export type IdParam = z.infer<typeof idParamSchema>;

export const searchSchema = z.object({
  q: z.string().min(1).max(200),
});

export type SearchParams = z.infer<typeof searchSchema>;

export * from './auth.js';
export * from './users.js';
export * from './drivers.js';
export * from './geocoding.js';
export * from './rides.js';
export * from './bookings.js';
export * from './matching.js';
export * from './trips.js';
export * from './ratings.js';
export * from './recurring.js';
export * from './notifications.js';
