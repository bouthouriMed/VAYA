import { ValidationError } from '../errors.js';

/**
 * Validation/canonicalisation of file references a client sends back to the
 * API (users.avatarFileUrl, vehicle photoFileUrl, verification document
 * fileUrl). docs/security/security-audit.md VAYA-SEC-009.
 *
 * These fields used to accept any non-empty string and persist it verbatim.
 * Consequences: (a) any external URL could become a user's avatar, which every
 * viewer's device then fetches — a tracking pixel / IP-and-timing leak against
 * whoever opens the profile; (b) account deletion calls `storage.remove` /
 * `removeSecure` on whatever these columns hold, so a reference to somebody
 * else's file turned "delete my account" into "delete their photo".
 *
 * The API never trusts a client-supplied URL (host, path or otherwise): it
 * extracts only the `<uuid>.<ext>` object name — the one shape every upload
 * this API mints has — and rebuilds the stored reference itself from that
 * name. An arbitrary host, a `..` segment, a `javascript:` URL or a
 * non-upload path simply has no such name and is rejected.
 */

const OBJECT_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic|pdf)$/i;

// The path segment that must directly precede the object name. `uploads` /
// `public` are the local-disk and S3 spellings of the public area;
// `secure-uploads` / `secure` of the private one (see the storage adapters).
const PUBLIC_PARENT_SEGMENTS = new Set(['uploads', 'public']);
const SECURE_PARENT_SEGMENTS = new Set(['secure-uploads', 'secure']);

export type FileReferenceKind = 'public' | 'secure';

/** Returns the lower-cased `<uuid>.<ext>` object name a reference points at,
 *  or null if it is not a well-formed reference of the given kind. */
export function extractObjectName(reference: string, kind: FileReferenceKind): string | null {
  if (typeof reference !== 'string' || reference.length === 0 || reference.length > 500) return null;

  let pathname: string;
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference)) {
    // Absolute URL — only http(s) is meaningful here (the mobile client
    // resolves relative upload paths against its API origin before sending
    // them back). Anything else (javascript:, data:, file:, ...) is refused.
    let url: URL;
    try {
      url = new URL(reference);
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    pathname = url.pathname;
  } else {
    pathname = reference.split(/[?#]/)[0] ?? '';
  }

  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length < 2) return null;
  const name = segments[segments.length - 1]!;
  const parent = segments[segments.length - 2]!;
  const allowedParents = kind === 'public' ? PUBLIC_PARENT_SEGMENTS : SECURE_PARENT_SEGMENTS;

  if (!allowedParents.has(parent) || !OBJECT_NAME_PATTERN.test(name)) return null;
  return name.toLowerCase();
}

/** Canonical stored form of a secure (KYC) reference. Identical for every
 *  storage adapter (both return this marker path from `saveSecure`). */
export function secureFileReference(objectName: string): string {
  return `/secure-uploads/${objectName}`;
}

/** Validates a client-supplied public-file reference and returns the
 *  canonical URL to store, built by the active adapter (`toPublicUrl`). */
export function resolvePublicFileReference(
  reference: string,
  toPublicUrl: (objectName: string) => string,
): string {
  const name = extractObjectName(reference, 'public');
  if (!name) {
    throw new ValidationError('Invalid file reference — upload the file first and use the returned URL');
  }
  return toPublicUrl(name);
}

/** Validates a client-supplied secure-file reference and returns the canonical
 *  marker path to store. */
export function resolveSecureFileReference(reference: string): string {
  const name = extractObjectName(reference, 'secure');
  if (!name) {
    throw new ValidationError('Invalid file reference — upload the file first and use the returned URL');
  }
  return secureFileReference(name);
}
