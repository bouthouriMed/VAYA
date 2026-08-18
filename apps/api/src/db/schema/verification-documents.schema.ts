import { pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { driverProfiles } from './driver-profiles.schema';

export const verificationDocumentTypeEnum = pgEnum('verification_document_type', [
  'license',
  'registration',
]);

export const verificationDocumentStatusEnum = pgEnum('verification_document_status', [
  'pending',
  'approved',
  'rejected',
]);

export const verificationDocuments = pgTable('verification_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  driverProfileId: uuid('driver_profile_id')
    .notNull()
    .references(() => driverProfiles.id, { onDelete: 'cascade' }),
  type: verificationDocumentTypeEnum('type').notNull(),
  fileUrl: varchar('file_url', { length: 500 }).notNull(),
  status: verificationDocumentStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
