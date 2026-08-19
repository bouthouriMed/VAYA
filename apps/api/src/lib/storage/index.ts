import { LocalDiskStorageAdapter } from './local-disk-storage-adapter.js';
import type { StorageAdapter } from './storage-adapter.js';

export type { StorageAdapter };

let _storage: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!_storage) {
    _storage = new LocalDiskStorageAdapter();
  }
  return _storage;
}
