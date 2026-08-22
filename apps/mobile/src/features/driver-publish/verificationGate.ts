/**
 * Gate for the review screen's "Publish ride" action (stitch/verification's
 * publish-verification-requirement-prompt.html): a ride only actually
 * publishes once the driver's profile is verified. Reachability note: today
 * `createRide` already requires a `vehicleId`, which only exists once a
 * driver profile does — and `drivers.service.ts`'s `createOnboarding` always
 * sets `verificationStatus: 'approved'` synchronously (locked product
 * decision, no admin review queue exists). So in practice this only ever
 * returns `false` for a profile that hasn't been created yet, never a real
 * `pending`/`rejected` one — kept as a real, independent check anyway
 * against the schema's full state space, and it's what the review screen's
 * gate is meant to express.
 */
export function isVerifiedDriver(
  driverProfile: { verificationStatus: 'pending' | 'approved' | 'rejected' } | null | undefined,
): boolean {
  return driverProfile?.verificationStatus === 'approved';
}
