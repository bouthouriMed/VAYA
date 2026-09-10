import { getEnv } from '../../config/env.js';
import { LocalDiskStorageAdapter } from './local-disk-storage-adapter.js';
import { S3StorageAdapter } from './s3-storage-adapter.js';
import type { StorageAdapter } from './storage-adapter.js';

export type { StorageAdapter };

let _storage: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!_storage) {
    const env = getEnv();
    _storage =
      env.S3_BUCKET && env.S3_REGION && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? new S3StorageAdapter({
            bucket: env.S3_BUCKET,
            region: env.S3_REGION,
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            endpoint: env.S3_ENDPOINT,
            forcePathStyle: env.S3_FORCE_PATH_STYLE,
            publicUrlBase: env.S3_PUBLIC_URL_BASE,
          })
        : new LocalDiskStorageAdapter();
  }
  return _storage;
}
