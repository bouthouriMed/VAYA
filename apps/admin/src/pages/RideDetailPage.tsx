import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCancelRide, useRideDetail } from '../api/hooks/rides';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { BookingStatusBadge, RideStatusBadge } from '../components/Badge';
import { ConfirmModal } from '../components/ConfirmModal';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { formatCurrency, formatDate } from '../utils/format';

// Mirrors packages/domain/src/ride/ride-status.ts's RIDE_STATUS_TRANSITIONS —
// 'draft' can only ever transition to 'published', never 'cancelled' (a
// draft ride was never actually offered to anyone, so there's nothing to
// cancel). Verified live: the server correctly 409s on a draft-ride cancel
// attempt.
const CANCELLABLE_STATUSES = new Set(['published', 'full', 'in_progress']);

export function RideDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: ride, isLoading, isError, error, refetch } = useRideDetail(id);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const cancelRide = useCancelRide(id!);

  if (isLoading) return <LoadingBlock rows={10} />;
  if (isError || !ride)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Ride not found'}
        onRetry={() => refetch()}
      />
    );

  const activeBookings = (ride.bookings ?? []).filter(
    (b) => b.status === 'pending' || b.status === 'accepted',
  );

  return (
    <div>
      <button type="button" className="back-link" onClick={() => navigate('/rides')}>
        <Icon name="arrowLeft" size={15} />
        Back to Rides
      </button>

      <div className="hero-band" style={{ marginBottom: 20 }}>
        <div className="hero-band__content">
          <div className="hero-band__eyebrow">
            <Icon name="route" size={14} /> Ride
          </div>
          <div className="hero-band__title" style={{ fontSize: 'var(--text-2xl)' }}>
            {ride.originLabel} <span style={{ opacity: 0.5 }}>→</span> {ride.destinationLabel}
          </div>
          <div className="hero-band__sub">Departs {formatDate(ride.departureAt)}</div>
        </div>
        <div className="hero-band__stats">
          <div className="hero-stat">
            <div className="hero-stat__value">
              {ride.seatsAvailable}/{ride.seatsTotal}
            </div>
            <div className="hero-stat__label">Seats</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat__value" style={{ fontSize: 22, paddingTop: 6 }}>
              <RideStatusBadge status={ride.status} />
            </div>
            <div className="hero-stat__label">Status</div>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-stack">
          <div className="card">
            <div className="section-title">Ride details</div>
            <div className="spec-grid">
              <div className="spec-item">
                <div className="spec-item__label">Driver</div>
                <div className="spec-item__value">
                  {ride.driverProfile?.user ? (
                    <a
                      href={`/users/${ride.driverProfile.user.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/users/${ride.driverProfile!.user!.id}`);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <Avatar name={ride.driverProfile.user.fullName} size="sm" variant="sage" />
                      {ride.driverProfile.user.fullName}
                    </a>
                  ) : (
                    '—'
                  )}
                </div>
              </div>
              <div className="spec-item">
                <div className="spec-item__label">Vehicle</div>
                <div className="spec-item__value">
                  {ride.vehicle
                    ? `${ride.vehicle.make} ${ride.vehicle.model} · ${ride.vehicle.plateNumber}`
                    : '—'}
                </div>
              </div>
              <div className="spec-item">
                <div className="spec-item__label">Price / seat</div>
                <div className="spec-item__value">{formatCurrency(ride.contributionPerSeat)}</div>
              </div>
              <div className="spec-item">
                <div className="spec-item__label">Seats</div>
                <div className="spec-item__value">
                  {ride.seatsAvailable} / {ride.seatsTotal}
                </div>
              </div>
            </div>
          </div>

          <div className="card card--flush">
            <div className="section-title" style={{ padding: '20px 24px 12px', margin: 0 }}>
              Bookings <span className="section-title__desc">{(ride.bookings ?? []).length}</span>
            </div>
            {!ride.bookings || ride.bookings.length === 0 ? (
              <EmptyState
                icon="person"
                title="No bookings on this ride"
                hint="Passenger bookings will appear here once riders request a seat."
              />
            ) : (
              <div className="table-wrap">
                <table className="table table--selectable">
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
                        <td className="table__primary">
                          <span className="table__cell-user">
                            <Avatar name={booking.rider?.fullName ?? ''} size="sm" />
                            {booking.rider?.fullName ?? '—'}
                          </span>
                        </td>
                        <td className="table__secondary">{booking.seatsRequested}</td>
                        <td className="table__secondary">
                          {formatCurrency(booking.contributionTotal)}
                        </td>
                        <td>
                          <BookingStatusBadge status={booking.status} />
                        </td>
                        <td className="table__cell-muted">
                          {booking.trip?.status ? booking.trip.status : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="detail-rail">
          <div className="card">
            <div className="section-title">Actions</div>
            {CANCELLABLE_STATUSES.has(ride.status) ? (
              <>
                <button
                  type="button"
                  className="btn btn--danger"
                  style={{ width: '100%' }}
                  onClick={() => setConfirmingCancel(true)}
                >
                  Cancel this ride
                </button>
                <p className="section-title__desc" style={{ marginTop: 12 }}>
                  Cancelling affects <strong>{activeBookings.length}</strong> active booking
                  {activeBookings.length === 1 ? '' : 's'} and notifies every affected rider.
                </p>
              </>
            ) : (
              <p className="section-title__desc" style={{ margin: 0 }}>
                This ride is {ride.status} and can no longer be cancelled.
              </p>
            )}
          </div>
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
          onConfirm={(reason) =>
            cancelRide.mutate(reason ?? '', { onSuccess: () => setConfirmingCancel(false) })
          }
          onCancel={() => setConfirmingCancel(false)}
        />
      ) : null}
    </div>
  );
}
