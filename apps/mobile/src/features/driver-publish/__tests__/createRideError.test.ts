import { describe, it, expect } from 'vitest';
import { classifyCreateRideError } from '../createRideError';

const apiError = (code: string, message: string, details?: Record<string, unknown>) => ({
  status: 403,
  data: { error: { code, message, details } },
});

describe('classifyCreateRideError', () => {
  it('a not-yet-approved driver gets the verification sheet, not a generic failure', () => {
    expect(
      classifyCreateRideError(apiError('FORBIDDEN', 'Your driver verification must be approved before publishing a ride')),
    ).toEqual({ kind: 'verification' });
    expect(classifyCreateRideError(apiError('FORBIDDEN', 'Complete driver onboarding before publishing a ride'))).toEqual({
      kind: 'verification',
    });
  });

  it('a restricted driver is told so', () => {
    expect(classifyCreateRideError(apiError('FORBIDDEN', 'Your driving privileges have been restricted'))).toEqual({
      kind: 'message',
      key: 'driver:publish.errors.accountRestricted',
    });
  });

  it('more seats than the vehicle has is explained', () => {
    expect(
      classifyCreateRideError(
        apiError('VALIDATION_ERROR', 'This vehicle has 2 seats', { seatsTotal: ['Must be at most 2 for this vehicle'] }),
      ),
    ).toEqual({ kind: 'message', key: 'driver:publish.errors.tooManySeats' });
  });

  it('anything else (network, server error) keeps the generic retry message', () => {
    expect(classifyCreateRideError({ status: 'FETCH_ERROR', error: 'Network request failed' })).toEqual({
      kind: 'message',
      key: 'driver:publish.errors.createFailed',
    });
    expect(classifyCreateRideError(undefined)).toEqual({ kind: 'message', key: 'driver:publish.errors.createFailed' });
  });
});
