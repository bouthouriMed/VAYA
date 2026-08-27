import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useUserDetail,
  useSuspendUser,
  useReactivateUser,
  useRestrictDriver,
  useUnrestrictDriver,
} from '../api/hooks/users';
import { LoadingBlock, ErrorState } from '../components/States';
import { Badge, RideStatusBadge, BookingStatusBadge } from '../components/Badge';
import { ConfirmModal } from '../components/ConfirmModal';
import { formatDate, formatCurrency, truncateId } from '../utils/format';

type PendingAction = 'suspend' | 'reactivate' | 'restrict' | 'unrestrict' | null;

export function UserDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useUserDetail(id);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const suspend = useSuspendUser(id!);
  const reactivate = useReactivateUser(id!);
  const restrict = useRestrictDriver(id!);
  const unrestrict = useUnrestrictDriver(id!);

  if (isLoading) return <LoadingBlock rows={10} />;
  if (isError || !data) return <ErrorState message={error instanceof Error ? error.message : 'User not found'} onRetry={() => refetch()} />;

  const { user, ridesAsDriver, bookingsAsRider } = data;

  return (
    <div>
      <button type="button" className="link-button" onClick={() => navigate('/users')} style={{ marginBottom: 16 }}>
        ← Back to Users
      </button>

      <div className="detail-grid">
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">
              {user.fullName}
              {user.suspendedAt ? <Badge label="Suspended" tone="error" /> : <Badge label="Active" tone="success" />}
            </div>
            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-row__label">Phone</span>
                <span className="kv-row__value">{user.phone ?? '—'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-row__label">Email</span>
                <span className="kv-row__value">{user.email ?? '—'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-row__label">Auth provider</span>
                <span className="kv-row__value">{user.authProvider}</span>
              </div>
              <div className="kv-row">
                <span className="kv-row__label">Joined</span>
                <span className="kv-row__value">{formatDate(user.createdAt)}</span>
              </div>
              {user.suspendedAt ? (
                <div className="kv-row">
                  <span className="kv-row__label">Suspension reason</span>
                  <span className="kv-row__value">{user.suspendedReason ?? '—'}</span>
                </div>
              ) : null}
            </div>
          </div>

          {user.driverProfile ? (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-title">
                Driver profile
                {user.driverProfile.suspendedAt ? (
                  <Badge label="Driving restricted" tone="error" />
                ) : (
                  <Badge label={user.driverProfile.verificationStatus} tone="info" />
                )}
              </div>
              <div className="kv-list">
                <div className="kv-row">
                  <span className="kv-row__label">Rating</span>
                  <span className="kv-row__value">{user.driverProfile.ratingAvg.toFixed(2)} ★</span>
                </div>
                <div className="kv-row">
                  <span className="kv-row__label">Trips completed</span>
                  <span className="kv-row__value">{user.driverProfile.tripCount}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-row__label">Reliability penalty points</span>
                  <span className="kv-row__value">{user.driverProfile.reliabilityPenaltyPoints}</span>
                </div>
                {user.driverProfile.suspendedAt ? (
                  <div className="kv-row">
                    <span className="kv-row__label">Restriction reason</span>
                    <span className="kv-row__value">{user.driverProfile.suspendedReason ?? '—'}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">Rides as driver (last {ridesAsDriver.length})</div>
            {ridesAsDriver.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13 }}>No rides published yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Departure</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ridesAsDriver.map((ride) => (
                      <tr key={ride.id} onClick={() => navigate(`/rides/${ride.id}`)}>
                        <td>
                          {ride.originLabel} → {ride.destinationLabel}
                        </td>
                        <td>{formatDate(ride.departureAt)}</td>
                        <td>
                          <RideStatusBadge status={ride.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-title">Bookings as rider (last {bookingsAsRider.length})</div>
            {bookingsAsRider.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13 }}>No bookings yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookingsAsRider.map((booking) => (
                      <tr key={booking.id} onClick={() => booking.rideId && navigate(`/rides/${booking.rideId}`)}>
                        <td>{booking.ride ? `${booking.ride.originLabel} → ${booking.ride.destinationLabel}` : truncateId(booking.rideId)}</td>
                        <td>{formatCurrency(booking.contributionTotal)}</td>
                        <td>
                          <BookingStatusBadge status={booking.status} />
                        </td>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {user.suspendedAt ? (
              <button type="button" className="btn btn--secondary" onClick={() => setPendingAction('reactivate')}>
                Reactivate account
              </button>
            ) : (
              <button type="button" className="btn btn--danger" onClick={() => setPendingAction('suspend')}>
                Suspend account
              </button>
            )}
            {user.driverProfile ? (
              user.driverProfile.suspendedAt ? (
                <button type="button" className="btn btn--secondary" onClick={() => setPendingAction('unrestrict')}>
                  Restore driving privileges
                </button>
              ) : (
                <button type="button" className="btn btn--ghost" onClick={() => setPendingAction('restrict')}>
                  Restrict driving privileges
                </button>
              )
            ) : null}
          </div>
        </div>
      </div>

      {pendingAction === 'suspend' ? (
        <ConfirmModal
          title="Suspend this user?"
          body="This blocks all API access for this user immediately, including riding and driving. They will not be able to log in until reactivated."
          confirmLabel="Suspend"
          tone="danger"
          requireReason
          reasonLabel="Suspension reason"
          isSubmitting={suspend.isPending}
          errorMessage={suspend.isError ? (suspend.error as Error).message : null}
          onConfirm={(reason) => suspend.mutate(reason ?? '', { onSuccess: () => setPendingAction(null) })}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}
      {pendingAction === 'reactivate' ? (
        <ConfirmModal
          title="Reactivate this user?"
          body="This restores full API access."
          confirmLabel="Reactivate"
          isSubmitting={reactivate.isPending}
          errorMessage={reactivate.isError ? (reactivate.error as Error).message : null}
          onConfirm={() => reactivate.mutate(undefined, { onSuccess: () => setPendingAction(null) })}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}
      {pendingAction === 'restrict' ? (
        <ConfirmModal
          title="Restrict driving privileges?"
          body="This driver will no longer be able to publish new rides. They can still ride as a passenger."
          confirmLabel="Restrict"
          tone="danger"
          requireReason
          reasonLabel="Restriction reason"
          isSubmitting={restrict.isPending}
          errorMessage={restrict.isError ? (restrict.error as Error).message : null}
          onConfirm={(reason) => restrict.mutate(reason ?? '', { onSuccess: () => setPendingAction(null) })}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}
      {pendingAction === 'unrestrict' ? (
        <ConfirmModal
          title="Restore driving privileges?"
          body="This driver will be able to publish rides again."
          confirmLabel="Restore"
          isSubmitting={unrestrict.isPending}
          errorMessage={unrestrict.isError ? (unrestrict.error as Error).message : null}
          onConfirm={() => unrestrict.mutate(undefined, { onSuccess: () => setPendingAction(null) })}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}
    </div>
  );
}
