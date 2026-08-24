import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getStorage } from '../../lib/storage/index.js';
import { ValidationError } from '../../lib/errors.js';

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB — plenty for a vehicle photo or ID scan

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
}
