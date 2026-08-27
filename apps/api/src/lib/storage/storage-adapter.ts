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
}
