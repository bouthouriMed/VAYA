/**
 * Magic-byte content sniffing for relayed uploads
 * (docs/security/security-audit.md VAYA-SEC-010).
 *
 * uploads.routes.ts validates the declared MIME type and the filename
 * extension — both client-controlled. A file named `x.png` with
 * `Content-Type: image/png` could still contain HTML or script and be served
 * back from the public `/uploads/` prefix. This inspects the first bytes and
 * only accepts content whose real format matches what was declared.
 *
 * Only the API-relayed path (`POST /uploads`, `/uploads/secure`) can do this —
 * a presigned direct-to-storage upload never passes through the API. See
 * docs/security/security-hardening.md for the storage-side controls that
 * cover that path (bucket CSP/`nosniff` response headers, object size limits).
 */

export type SniffedFormat = 'jpeg' | 'png' | 'webp' | 'heic' | 'pdf';

function startsWith(buffer: Buffer, signature: number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  return signature.every((byte, index) => buffer[offset + index] === byte);
}

export function sniffFileFormat(buffer: Buffer): SniffedFormat | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  // WEBP: "RIFF" <size> "WEBP"
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'webp';
  }
  // PDF: "%PDF-" (a few readers tolerate leading junk; this API does not).
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  // ISO-BMFF `ftyp` box carrying a HEIC/HEIF brand.
  if (startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'heic';
  }
  return null;
}

/**
 * True iff the bytes are one of the formats this API accepts (JPEG/PNG/WEBP/
 * HEIC/PDF), regardless of what the extension says. Deliberately NOT an exact
 * extension-to-format match: a phone can legitimately hand over HEIC bytes in
 * a `.jpg`-named file, and rejecting that would break real uploads for no
 * security gain — the threat is content that is *not an image or PDF at all*
 * (HTML, SVG, script), which this rejects.
 */
export function isRecognisedUploadContent(buffer: Buffer): boolean {
  return sniffFileFormat(buffer) !== null;
}
