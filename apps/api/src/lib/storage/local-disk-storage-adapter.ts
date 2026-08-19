import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageAdapter } from './storage-adapter.js';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

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
}
