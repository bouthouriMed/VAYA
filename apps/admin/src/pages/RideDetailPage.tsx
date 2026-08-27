import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCancelRide, useRideDetail } from '../api/hooks/rides';
import { LoadingBlock, ErrorState } from '../components/States';
import { BookingStatusBadge, RideStatusBadge } from '../components/Badge';
import { ConfirmModal } from '../components/ConfirmModal';
import { formatCurrency, formatDate } from '../utils/format';

// Mirrors packages/domain/src/ride/ride-status.ts's RIDE_STATUS_TRANSITIONS —
// 'draft' can only ever transition to 'published', never 'cancelled' (a
// draft ride was never actually offered to anyone, so there's nothing to
// cancel). Verified live: the server correctly 409s on a draft-ride cancel
// attempt; this was originally listed as cancellable here and would have
// shown a button that always failed.
const CANCELLABLE_STATUSES = new Set(['published', 'full', 'in_progress']);

export function RideDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: ride, isLoading, isError, error, refetch } = useRideDetail(id);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const cancelRide = useCancelRide(id!);

  if (isLoading) return <LoadingBlock rows={10} />;
  if (isError || !ride) return <ErrorState message={error instanceof Error ? error.message : 'Ride not found'} onRetry={() => refetch()} />;

  const activeBookings = (ride.bookings ?? []).filter((b) => b.status === 'pending' || b.status === 'accepted');

  return (
    <div>
      <button type="button" className="link-button" onClick={() => navigate('/rides')} style={{ marginBottom: 16 }}>
        ← Back to Rides
      </button>

      <div className="detail-grid">
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">
              {ride.originLabel} → {ride.destinationLabel}
              <RideStatusBadge status={ride.status} />
            </div>
            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-row__label">Departure</span>
                <span className="kv-row__value">{formatDate(ride.departureAt)}</span>
              </div>
              <div className="kv-row">
                <span className="kv-row__label">Driver</span>
                <span className="kv-row__value">
                  {ride.driverProfile?.user ? (
                    <a
                      href={`/users/${ride.driverProfile.user.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/users/${ride.driverProfile!.user!.id}`);
                      }}
                    >
                      {ride.driverProfile.user.fullName}
                    </a>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-row__label">Vehicle</span>
                <span className="kv-row__value">
                  {ride.vehicle ? `${ride.vehicle.make} ${ride.vehicle.model} · ${ride.vehicle.plateNumber}` : '—'}
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-row__label">Seats</span>
                <span className="kv-row__value">
                  {ride.seatsAvailable} available / {ride.seatsTotal} total
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-row__label">Price per seat</span>
                <span className="kv-row__value">{formatCurrency(ride.contributionPerSeat)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Bookings ({(ride.bookings ?? []).length})</div>
            {!ride.bookings || ride.bookings.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13 }}>No bookings on this ride yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rider</th>
                      <th>Seats</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Trip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ride.bookings.map((booking) => (
                      <tr
                        key={booking.id}
                        onClick={() => booking.rider && navigate(`/users/${booking.rider.id}`)}
                      >
                        <td>{booking.rider?.fullName ?? '—'}</td>
                        <td>{booking.seatsRequested}</td>
                        <td>{formatCurrency(booking.contributionTotal)}</td>
                        <td>
                          <BookingStatusBadge status={booking.status} />
                        </td>
                        <td>{booking.trip?.status ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="section-title">Actions</div>
          {CANCELLABLE_STATUSES.has(ride.status) ? (
            <button type="button" className="btn btn--danger" style={{ width: '100%' }} onClick={() => setConfirmingCancel(true)}>
              Cancel this ride
            </button>
          ) : (
            <p className="text-muted" style={{ fontSize: 13 }}>
              This ride is {ride.status} and can no longer be cancelled.
            </p>
          )}
        </div>
      </div>

      {confirmingCancel ? (
        <ConfirmModal
          title="Cancel this ride?"
          body={
            <>
              This will cancel the ride and{' '}
              <strong>
                {activeBookings.length} active booking{activeBookings.length === 1 ? '' : 's'}
              </strong>
              . Every affected rider will be notified automatically.
            </>
          }
          confirmLabel="Cancel ride"
          tone="danger"
          requireReason
          reasonLabel="Cancellation reason"
          isSubmitting={cancelRide.isPending}
          errorMessage={cancelRide.isError ? (cancelRide.error as Error).message : null}
          onConfirm={(reason) => cancelRide.mutate(reason ?? '', { onSuccess: () => setConfirmingCancel(false) })}
          onCancel={() => setConfirmingCancel(false)}
        />
      ) : null}
    </div>
  );
}
