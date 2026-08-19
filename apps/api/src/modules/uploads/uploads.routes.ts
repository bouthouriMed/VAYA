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
      schema: { response: { 200: z.object({ url: z.string().url() }) } },
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

      // The storage adapter only knows a relative path — build an absolute
      // URL from the request the client actually used to reach us (host
      // header includes the port), so this works whether the API was hit
      // via localhost or a LAN IP.
      const absoluteUrl = `${request.protocol}://${request.headers.host}${relativeUrl}`;
      reply.send({ url: absoluteUrl });
    },
  );
}
