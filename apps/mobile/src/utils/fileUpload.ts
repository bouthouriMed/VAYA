import type { PresignUploadResult } from '../state/api';

/**
 * Reads a local file URI (camera capture or image-picker result) into a
 * real Blob via `fetch(uri).blob()` rather than the classic React Native
 * trick of appending a plain `{ uri, name, type }` object cast as `Blob` —
 * that shape relies on RN's networking layer specially recognizing it,
 * which is not reliable under the New Architecture (this app's Expo SDK
 * version defaults to it): the fetch call can fail before any network
 * request is even attempted, with no server-side trace at all.
 *
 * A Blob read this way often comes back with an empty/generic `.type`
 * (there's no real HTTP response to derive a Content-Type from) — the
 * server's upload routes reject that outright (`assertAllowedUpload`,
 * apps/api/src/modules/uploads/uploads.routes.ts). `Blob.slice` rebuilds
 * the same bytes with an explicit, known-correct MIME type derived from
 * the file's own extension, without re-reading the file.
 */
const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
};

async function readTypedBlob(
  uri: string,
  name: string,
): Promise<{ blob: Blob; filename: string; contentType: string }> {
  const match = /\.(\w+)$/.exec(uri);
  const ext = (match?.[1] ?? 'jpg').toLowerCase();
  const contentType = MIME_TYPES_BY_EXTENSION[ext] ?? 'image/jpeg';
  const response = await fetch(uri);
  const rawBlob = await response.blob();
  const blob = rawBlob.slice(0, rawBlob.size, contentType);
  return { blob, filename: `${name}.${ext}`, contentType };
}

/** Builds multipart FormData for the legacy relay-upload endpoints
 *  (/uploads, /uploads/secure) — still the fallback path when a presigned
 *  URL isn't available (`PresignUploadResult`'s `mode: 'relay'`, e.g. local
 *  dev with no S3 configured). */
export async function fileFromUri(uri: string, name: string): Promise<FormData> {
  const { blob, filename } = await readTypedBlob(uri, name);
  const formData = new FormData();
  formData.append('file', blob, filename);
  return formData;
}

/**
 * Uploads a local file, preferring a direct PUT to object storage over
 * relaying the bytes through the API.
 *
 * Real, measured latency this fixes: the relay endpoints buffer the whole
 * file server-side (`file.toBuffer()`) before even starting the upstream
 * write to R2/S3 — a client pays for the same bytes twice, sequentially. A
 * single ~2-4MB document over a real mobile connection measured 7-26s this
 * way in production. Getting a presigned URL and PUTting straight to
 * storage collapses that to one hop.
 *
 * `presign` is expected to be `presignUpload`/`presignSecureUpload`'s RTK
 * Query trigger (already bound to the right endpoint by the caller);
 * `relayUpload` is `uploadFile`/`uploadSecureFile`'s, used only when the
 * server reports `mode: 'relay'` (no S3 configured).
 */
export async function uploadViaPresignedUrl(params: {
  uri: string;
  name: string;
  presign: (args: { filename: string; contentType: string }) => Promise<PresignUploadResult>;
  relayUpload: (formData: FormData) => Promise<{ url: string }>;
}): Promise<{ url: string }> {
  const { blob, filename, contentType } = await readTypedBlob(params.uri, params.name);
  const presignResult = await params.presign({ filename, contentType });

  if (presignResult.mode === 'relay') {
    const formData = new FormData();
    formData.append('file', blob, filename);
    return params.relayUpload(formData);
  }

  const putResponse = await fetch(presignResult.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putResponse.ok) {
    throw new Error(`Direct upload to storage failed (${putResponse.status})`);
  }
  return { url: presignResult.finalUrl };
}
