import { useEffect, useState } from 'react';
import { fetchDocumentObjectUrl } from '../api/client';

/** Renders one verification document's actual image via the authenticated
 *  streaming endpoint (GET /admin/verifications/documents/:id/file) — never
 *  a plain <img src> pointed at the API, since that endpoint requires a
 *  Bearer token an <img> tag can't send. Fetches the bytes as a Blob and
 *  renders via a revocable object URL. */
export function SecureDocumentImage({ documentId, alt }: { documentId: string; alt: string }): React.JSX.Element {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let currentUrl: string | null = null;
    setError(false);
    setObjectUrl(null);

    fetchDocumentObjectUrl(`/admin/verifications/documents/${documentId}/file`)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        currentUrl = url;
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [documentId]);

  if (error) {
    return (
      <div className="doc-card__image-wrap">
        <span className="text-muted" style={{ fontSize: 12, padding: 8 }}>
          Failed to load
        </span>
      </div>
    );
  }

  if (!objectUrl) {
    return <div className="doc-card__image-wrap skeleton" />;
  }

  return (
    <div className="doc-card__image-wrap">
      <img src={objectUrl} alt={alt} onClick={() => window.open(objectUrl, '_blank')} />
    </div>
  );
}
