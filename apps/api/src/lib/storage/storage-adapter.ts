export interface StorageAdapter {
  /** Persists a file and returns a publicly reachable URL. */
  save(params: { buffer: Buffer; filename: string; contentType: string }): Promise<string>;

  /**
   * Persists a file OUTSIDE the publicly-served static directory — for
   * driver KYC documents (license/registration/insurance/selfie), which
   * must never be reachable by anyone who merely learns the URL (unlike
   * avatar/vehicle photos, which are meant to be shown to matched
   * counterparts and stay on `save` above). Returns a relative marker path
   * (`/secure-uploads/<name>`) that is never registered as a static prefix —
   * the only way to read it back is `readSecure` below, gated behind a real
   * authorization check at the route layer (admin review, or the owning
   * driver themself).
   */
  saveSecure(params: { buffer: Buffer; filename: string; contentType: string }): Promise<string>;

  /**
   * Reads a file previously written by `saveSecure`. Accepts either the
   * relative marker path or a full absolute URL (verification_documents.
   * fileUrl is stored absolute — see packages/validation/src/drivers.ts's
   * `.url()` constraint — built from whichever origin the uploading device
   * itself resolved, which an admin's browser may not share); only the
   * filename component is ever used to locate the file on disk. Also checks
   * the legacy public uploads directory as a fallback, so a document
   * submitted before this fix (still resolvable at its original public URL)
   * doesn't 404 here. Returns null if the file can't be found in either
   * location.
   */
  readSecure(fileUrlOrPath: string): Promise<{ buffer: Buffer; contentType: string } | null>;

  /**
   * Deletes a file previously written by `save` (public avatar/vehicle
   * photos). Best-effort: a caller that already has nothing to delete (a
   * missing file, an already-cleared URL) treats this as a no-op rather
   * than an error — deletion always proceeds even if the file is already
   * gone (docs/legal/privacy-policy.md §10, account deletion).
   */
  remove(fileUrlOrPath: string): Promise<void>;

  /** Deletes a file previously written by `saveSecure` (driver KYC
   *  documents) — the real erasure `docs/legal/privacy-policy.md` §10
   *  promises on account deletion, not just a DB row soft-delete. */
  removeSecure(fileUrlOrPath: string): Promise<void>;

  /**
   * Optional: mints a short-lived URL the client can PUT bytes to directly,
   * bypassing this API as a relay. Real, measured latency this fixes: an
   * upload through `save`/`saveSecure` pays for the file twice — once
   * client→API, then again API→object store, sequentially, since the route
   * handler buffers the whole file (`file.toBuffer()`) before forwarding it
   * — a single ~2-4MB photo over a real mobile connection took 7-26s this
   * way. A presigned PUT collapses that to one hop.
   *
   * Only adapters actually backed by an object store (S3StorageAdapter)
   * implement this — LocalDiskStorageAdapter has no meaningful concept of a
   * client-reachable presigned URL, so it's absent there. Callers MUST
   * treat a missing/undefined method as "fall back to the legacy
   * save/saveSecure relay flow", never assume it exists.
   */
  presignUpload?(params: {
    filename: string;
    contentType: string;
    secure: boolean;
  }): Promise<{ uploadUrl: string; finalUrl: string }>;
}
