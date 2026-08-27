import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import type { StorageAdapter } from './storage-adapter.js';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
// Deliberately never registered under @fastify/static (see app.ts) — the
// only read path is readSecure below, called only from routes that gate on
// authenticateAdmin or an explicit ownership check (docs/domain/
// verification-workflow.md's "Document security" section).
const SECURE_UPLOADS_DIR = path.resolve(process.cwd(), 'secure-uploads');

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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Extracts just the filename component from a relative path or an absolute
 *  URL (verification_documents.fileUrl is stored absolute) — the only part
 *  ever used to locate a file on disk, so a caller can never pass a path
 *  that escapes either upload directory. */
function basenameOf(fileUrlOrPath: string): string {
  const withoutQuery = fileUrlOrPath.split('?')[0] ?? fileUrlOrPath;
  return path.basename(withoutQuery);
}

export class LocalDiskStorageAdapter implements StorageAdapter {
  async save({
    buffer,
    filename,
    contentType: _contentType,
  }: {
    buffer: Buffer;
    filename: string;
    contentType: string;
  }): Promise<string> {
    await mkdir(UPLOADS_DIR, { recursive: true });
    const ext = path.extname(filename);
    const storedName = `${randomUUID()}${ext}`;
    await writeFile(path.join(UPLOADS_DIR, storedName), buffer);
    return `/uploads/${storedName}`;
  }

  async saveSecure({
    buffer,
    filename,
    contentType: _contentType,
  }: {
    buffer: Buffer;
    filename: string;
    contentType: string;
  }): Promise<string> {
    await mkdir(SECURE_UPLOADS_DIR, { recursive: true });
    const ext = path.extname(filename);
    const storedName = `${randomUUID()}${ext}`;
    await writeFile(path.join(SECURE_UPLOADS_DIR, storedName), buffer);
    return `/secure-uploads/${storedName}`;
  }

  async readSecure(fileUrlOrPath: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const name = basenameOf(fileUrlOrPath);
    const securePath = path.join(SECURE_UPLOADS_DIR, name);
    if (await fileExists(securePath)) {
      const buffer = await readFile(securePath);
      return { buffer, contentType: contentTypeForExt(path.extname(name)) };
    }
    // Legacy fallback: a document submitted before this fix, still sitting
    // in the public uploads directory under its original fileUrl.
    const legacyPath = path.join(UPLOADS_DIR, name);
    if (await fileExists(legacyPath)) {
      const buffer = await readFile(legacyPath);
      return { buffer, contentType: contentTypeForExt(path.extname(name)) };
    }
    return null;
  }
}
