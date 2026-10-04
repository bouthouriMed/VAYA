/**
 * What the publish wizard should do when `POST /rides` fails. The screen
 * used to show one generic "Impossible de créer ce trajet" for every
 * failure — including a driver whose verification is still pending (the
 * server rejects ride creation until an admin approves the profile), who
 * then had no idea why or what to do next.
 */
export type CreateRideFailure =
  /** Driver not approved (yet): show the status-specific verification sheet. */
  | { kind: 'verification' }
  /** A specific, explainable reason — show this translation key. */
  | { kind: 'message'; key: string };

function errorBody(error: unknown): { code?: string; message?: string; details?: Record<string, unknown> } {
  if (typeof error !== 'object' || error === null || !('data' in error)) return {};
  const data = (error as { data?: { error?: { code?: unknown; message?: unknown; details?: unknown } } }).data;
  const body = data?.error;
  return {
    code: typeof body?.code === 'string' ? body.code : undefined,
    message: typeof body?.message === 'string' ? body.message : undefined,
    details: typeof body?.details === 'object' && body.details !== null ? (body.details as Record<string, unknown>) : undefined,
  };
}

export function classifyCreateRideError(error: unknown): CreateRideFailure {
  const { code, message = '', details } = errorBody(error);
  if (code === 'FORBIDDEN') {
    // rides.service.ts's getDriverProfileOrThrow.
    if (/onboarding|verification/i.test(message)) return { kind: 'verification' };
    if (/restricted/i.test(message)) return { kind: 'message', key: 'driver:publish.errors.accountRestricted' };
  }
  if (code === 'VALIDATION_ERROR' && details && 'seatsTotal' in details) {
    // assertSeatsFitVehicle: more seats than the vehicle has.
    return { kind: 'message', key: 'driver:publish.errors.tooManySeats' };
  }
  return { kind: 'message', key: 'driver:publish.errors.createFailed' };
}
