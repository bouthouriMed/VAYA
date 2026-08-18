export interface StorageAdapter {
  /** Persists a file and returns a publicly reachable URL. */
  save(params: { buffer: Buffer; filename: string; contentType: string }): Promise<string>;
}
