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

export * from './auth';
export * from './users';
export * from './drivers';
export * from './geocoding';
export * from './rides';
export * from './bookings';
export * from './matching';
export * from './admin';
export * from './trips';
export * from './ratings';
export * from './recurring';
export * from './notifications';
export * from './conversations';
