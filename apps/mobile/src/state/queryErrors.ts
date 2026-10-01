import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { SerializedError } from '@reduxjs/toolkit';

type QueryError = FetchBaseQueryError | SerializedError | undefined;

/** True when the request failed with an HTTP status code equal to `status`. */
export function isQueryErrorStatus(error: QueryError, status: number): boolean {
  return error != null && 'status' in error && error.status === status;
}

/**
 * True for a real failure, false for "no error" and for a 404. Some
 * endpoints use 404 to mean "doesn't exist yet" (no driver profile, no
 * conversation before acceptance) — that's an empty state. Anything else
 * (network down, 500) is an error and must be shown as one, never as empty.
 */
export function isQueryErrorOtherThan404(error: QueryError): boolean {
  return error != null && !isQueryErrorStatus(error, 404);
}
