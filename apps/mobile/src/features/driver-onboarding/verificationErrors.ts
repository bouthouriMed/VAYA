/**
 * Pure presentation logic for turning the failure modes of the driver-
 * verification submit (`selfie.tsx`'s submit(): three file uploads followed
 * by POST /drivers/onboarding) into honest, actionable French copy — no
 * React, no network, deterministic given its inputs (same discipline as
 * inboxHelpers/rankStopsByWalkDistance).
 *
 * Two hard rules shape this module:
 * - Never surface raw server strings (they are English developer text,
 *   e.g. "Driver profile already exists for this user") — map by code.
 * - Never invent a cause the error can't back: an opaque failure says
 *   "réessayez", not "vérifiez votre connexion".
 */

/** Subset of RTK Query's serialized error shape this app can receive. */
export interface RtkQueryErrorShape {
  status?: unknown;
  data?: { error?: { code?: unknown } };
}

export type VerificationErrorKind = 'offline' | 'session' | 'validation' | 'conflict' | 'server';

export interface VerificationErrorInfo {
  kind: VerificationErrorKind;
  /** Ready-to-render French copy for the screen's inline error slot. */
  message: string;
}

function asRtkError(error: unknown): RtkQueryErrorShape | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { status?: unknown; data?: unknown };
  if (!('status' in candidate)) return null;
  if (typeof candidate.data === 'object' && candidate.data !== null) {
    return candidate as RtkQueryErrorShape;
  }
  // HTTP errors carry data; pure transport errors don't — both are valid.
  return { status: candidate.status };
}

function errorCode(error: RtkQueryErrorShape): string | undefined {
  const code = error.data?.error?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Maps a thrown `.unwrap()` rejection from the verification submit into
 * user-facing copy. `stage` distinguishes the two phases that fail
 * differently for the user: uploading the three document photos vs
 * creating the driver profile itself.
 */
export function describeVerificationSubmitError(
  error: unknown,
  stage: 'documents' | 'profile',
): VerificationErrorInfo {
  const rtkError = asRtkError(error);

  if (rtkError?.status === 'FETCH_ERROR' || rtkError?.status === 'TIMEOUT_ERROR') {
    return {
      kind: 'offline',
      message:
        stage === 'documents'
          ? "L'envoi de vos documents a échoué. Vérifiez votre connexion internet puis réessayez."
          : 'Impossible de joindre le serveur pour le moment. Vérifiez votre connexion internet puis réessayez.',
    };
  }

  if (rtkError?.status === 401 || errorCode(rtkError ?? {}) === 'UNAUTHORIZED') {
    return {
      kind: 'session',
      message: 'Votre session a expiré. Reconnectez-vous puis reprenez la vérification.',
    };
  }

  const code = errorCode(rtkError ?? {});
  if (code === 'CONFLICT') {
    // Handled specially by the caller (a pre-existing profile means the
    // verification is already done) — the message here is a fallback only.
    return { kind: 'conflict', message: 'Un profil conducteur existe déjà pour ce compte.' };
  }
  if (code === 'VALIDATION_ERROR') {
    return {
      kind: 'validation',
      message: 'Certaines informations sont invalides. Vérifiez-les puis réessayez.',
    };
  }

  return {
    kind: 'server',
    message:
      stage === 'documents'
        ? "Nous n'avons pas pu enregistrer vos documents. Réessayez dans un instant."
        : "Nous n'avons pas pu créer votre profil conducteur. Réessayez dans un instant.",
  };
}
