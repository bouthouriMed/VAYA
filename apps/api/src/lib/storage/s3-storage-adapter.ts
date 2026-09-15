import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import type { StorageAdapter } from './storage-adapter.js';

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.pdf': 'application/pdf',
};

function contentTypeForExt(ext: string): string {
  return CONTENT_TYPE_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream';
}

/** Extracts just the key component from a stored path or an absolute URL —
 *  mirrors LocalDiskStorageAdapter's basenameOf so a caller can never pass a
 *  value that escapes the intended prefix. */
function basenameOf(fileUrlOrPath: string): string {
  const withoutQuery = fileUrlOrPath.split('?')[0] ?? fileUrlOrPath;
  return path.basename(withoutQuery);
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  // @ts-expect-error - AWS SDK v3's Body is a Node Readable at runtime in this environment.
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Real cloud object storage for a production deploy — LocalDiskStorageAdapter
 * writes to the API container's own filesystem, which is fine for a single
 * dev machine but silently loses every uploaded file (most critically KYC
 * documents) the moment an ephemeral production container is redeployed or
 * restarted. Works against AWS S3 or any S3-compatible provider (Cloudflare
 * R2, MinIO, etc.) via S3_ENDPOINT/S3_FORCE_PATH_STYLE.
 *
 * `save()` (public avatar/vehicle photos) uploads under a `public/` prefix
 * and returns a directly reachable URL (S3_PUBLIC_URL_BASE, or the bucket's
 * own virtual-hosted-style URL) — the bucket/CDN is expected to already be
 * configured for public read on that prefix, the same trust boundary the
 * local-disk adapter's `/uploads/` static mount already assumed.
 * `saveSecure()`/`readSecure()` (KYC documents) use a `secure/` prefix that
 * is never exposed via a public URL — the only read path is `readSecure`,
 * gated at the route layer exactly as the local-disk adapter's doc comment
 * describes, fetched here via an authenticated `GetObjectCommand` rather
 * than a public URL.
 */
export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string | undefined;

  constructor(params: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    publicUrlBase?: string;
  }) {
    this.bucket = params.bucket;
    this.publicUrlBase = params.publicUrlBase;
    const config: S3ClientConfig = {
      region: params.region,
      credentials: {
        accessKeyId: params.accessKeyId,
        secretAccessKey: params.secretAccessKey,
      },
    };
    if (params.endpoint) {
      config.endpoint = params.endpoint;
      config.forcePathStyle = params.forcePathStyle ?? true;
    }
    this.client = new S3Client(config);
  }

  private publicUrlFor(key: string): string {
    if (this.publicUrlBase) {
      return `${this.publicUrlBase.replace(/\/$/, '')}/${key}`;
    }
    return `https://${this.bucket}.s3.amazonaws.com/${key}`;
  }

  async save({
    buffer,
    filename,
    contentType,
  }: {
    buffer: Buffer;
    filename: string;
    contentType: string;
  }): Promise<string> {
    const ext = path.extname(filename);
    const key = `public/${randomUUID()}${ext}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || contentTypeForExt(ext),
      }),
    );
    return this.publicUrlFor(key);
  }

  async saveSecure({
    buffer,
    filename,
    contentType,
  }: {
    buffer: Buffer;
    filename: string;
    contentType: string;
  }): Promise<string> {
    const ext = path.extname(filename);
    const storedName = `${randomUUID()}${ext}`;
    const key = `secure/${storedName}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType || contentTypeForExt(ext),
      }),
    );
    return `/secure-uploads/${storedName}`;
  }

  async readSecure(fileUrlOrPath: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const name = basenameOf(fileUrlOrPath);
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: `secure/${name}` }),
      );
      const buffer = await streamToBuffer(result.Body);
      return { buffer, contentType: result.ContentType ?? contentTypeForExt(path.extname(name)) };
    } catch {
      // Legacy fallback: a document saved under the old public/ prefix
      // before this adapter existed, mirroring LocalDiskStorageAdapter's own
      // legacy-uploads-dir fallback.
      try {
        const result = await this.client.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: `public/${name}` }),
        );
        const buffer = await streamToBuffer(result.Body);
        return { buffer, contentType: result.ContentType ?? contentTypeForExt(path.extname(name)) };
      } catch {
        return null;
      }
    }
  }

  async remove(fileUrlOrPath: string): Promise<void> {
    const name = basenameOf(fileUrlOrPath);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: `public/${name}` }));
    } catch {
      // Already gone (or never existed) — deletion still succeeds.
    }
  }

  async removeSecure(fileUrlOrPath: string): Promise<void> {
    const name = basenameOf(fileUrlOrPath);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: `secure/${name}` }));
    } catch {
      // Already gone (or never existed) — deletion still succeeds.
    }
    try {
      // Legacy documents may sit under the old public/ prefix (readSecure's
      // own fallback) — best-effort cleanup there too.
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: `public/${name}` }));
    } catch {
      // Already gone (or never existed) — deletion still succeeds.
    }
  }
}
