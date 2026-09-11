import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getStorage } from '../../lib/storage/index.js';
import { ValidationError } from '../../lib/errors.js';

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB — plenty for a vehicle photo or ID scan

// Both the declared content-type AND the filename extension must match one
// of these — neither alone is trustworthy (a client can send any Content-
// Type header, and LocalDiskStorageAdapter/S3StorageAdapter both derive the
// stored extension from the filename). Without this, an uploaded `x.svg` or
// `x.html` was written verbatim into the publicly-served /uploads/ prefix
// with an attacker-chosen extension — a stored-XSS-via-upload vector once
// that raw URL is opened directly in a browser.
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.pdf']);

function assertAllowedUpload(filename: string, mimetype: string): void {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimetype) || !ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    throw new ValidationError('Unsupported file type — only JPEG/PNG/WEBP/HEIC/PDF are accepted');
  }
}

export async function uploadsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const storage = getStorage();

  app.post(
    '/uploads',
    {
      onRequest: [fastify.authenticate],
      schema: { response: { 200: z.object({ url: z.string() }) } },
    },
    async (request, reply) => {
      const file = await request.file({ limits: { fileSize: MAX_FILE_BYTES } });
      if (!file) throw new ValidationError('No file provided');
      assertAllowedUpload(file.filename, file.mimetype);

      const buffer = await file.toBuffer();
      const relativeUrl = await storage.save({
        buffer,
        filename: file.filename,
        contentType: file.mimetype,
      });

      // Relative, not absolute: building an absolute URL from *this*
      // request's own Host header ties the file to whichever address the
      // uploading device happened to reach the API through (e.g. an
      // Android emulator's 10.0.2.2 alias, or a dev machine's `localhost`
      // via adb reverse) — a real bug, confirmed live: a photo uploaded
      // from one platform rendered fine on that platform but silently
      // fell back to initials everywhere else, because no other device
      // could reach that baked-in host at all. The mobile client resolves
      // this relative path against its own known-working API origin
      // instead (see resolveMediaUrls in apps/mobile/src/state/api.ts),
      // so it's always correct for whichever device is actually viewing
      // it, not whichever one uploaded it.
      reply.send({ url: relativeUrl });
    },
  );

  // Driver KYC documents (license/registration/insurance/selfie) go through
  // this endpoint instead of the one above — saveSecure writes outside the
  // publicly-served uploads directory (docs/domain/verification-workflow.md's
  // "Document security" section). Mobile's CaptureCamera consumers
  // (license.tsx/insurance.tsx/selfie.tsx) are the only intended callers;
  // avatar/vehicle-photo uploads keep using the public /uploads endpoint
  // above unchanged, since those are meant to be visible to matched
  // counterparts.
  app.post(
    '/uploads/secure',
    {
      onRequest: [fastify.authenticate],
      schema: { response: { 200: z.object({ url: z.string() }) } },
    },
    async (request, reply) => {
      const file = await request.file({ limits: { fileSize: MAX_FILE_BYTES } });
      if (!file) throw new ValidationError('No file provided');
      assertAllowedUpload(file.filename, file.mimetype);

      const buffer = await file.toBuffer();
      const relativeUrl = await storage.saveSecure({
        buffer,
        filename: file.filename,
        contentType: file.mimetype,
      });

      reply.send({ url: relativeUrl });
    },
  );
}
