import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useUserDetail,
  useSuspendUser,
  useReactivateUser,
  useRestrictDriver,
  useUnrestrictDriver,
} from '../api/hooks/users';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { Badge, RideStatusBadge, BookingStatusBadge } from '../components/Badge';
import { ConfirmModal } from '../components/ConfirmModal';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
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
  if (isError || !data)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'User not found'}
        onRetry={() => refetch()}
      />
    );

  const { user, ridesAsDriver, bookingsAsRider } = data;

  return (
    <div>
      <button type="button" className="back-link" onClick={() => navigate('/users')}>
        <Icon name="arrowLeft" size={15} />
        Back to Users
      </button>

      <div className="hero-band" style={{ marginBottom: 20 }}>
        <div className="hero-band__content">
          <div className="hero-band__eyebrow">
            <Icon name="person" size={14} /> Member
          </div>
          <div className="hero-band__title" style={{ fontSize: 'var(--text-2xl)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={user.fullName} variant="navy" />
              {user.fullName}
            </span>
          </div>
          <div className="hero-band__sub">
            Joined {formatDate(user.createdAt)} · {user.authProvider === 'phone' ? 'Phone' : 'Google'}{' '}
            auth
            {user.suspendedAt ? ' · Suspended' : ' · Active'}
          </div>
        </div>
        <div className="hero-band__stats">
          {user.driverProfile ? (
            <>
              <div className="hero-stat">
                <div className="hero-stat__value">{user.driverProfile.ratingAvg.toFixed(1)}</div>
                <div className="hero-stat__label">Driver rating</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat__value">{user.driverProfile.tripCount}</div>
                <div className="hero-stat__label">Trips</div>
              </div>
            </>
          ) : (
            <div className="hero-stat">
              <div className="hero-stat__value" style={{ fontSize: 18, paddingTop: 8 }}>
                Rider
              </div>
              <div className="hero-stat__label">Role</div>
            </div>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-stack">
          <div className="card">
            <div className="section-title">Account</div>
            <div className="spec-grid">
              <div className="spec-item">
                <div className="spec-item__label">Phone</div>
                <div className="spec-item__value">{user.phone ?? '—'}</div>
              </div>
              <div className="spec-item">
                <div className="spec-item__label">Email</div>
                <div className="spec-item__value spec-item__value--muted">{user.email ?? '—'}</div>
              </div>
              <div className="spec-item">
                <div className="spec-item__label">Status</div>
                <div className="spec-item__value">
                  {user.suspendedAt ? <Badge label="Suspended" tone="error" /> : <Badge label="Active" tone="success" />}
                </div>
              </div>
              {user.suspendedAt ? (
                <div className="spec-item">
                  <div className="spec-item__label">Suspension reason</div>
                  <div className="spec-item__value spec-item__value--muted">
                    {user.suspendedReason ?? '—'}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {user.driverProfile ? (
            <div className="card">
              <div className="section-title">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="shield" size={16} style={{ color: 'var(--color-accent-deep)' }} />
                  Driver profile
                </span>
                {user.driverProfile.suspendedAt ? (
                  <Badge label="Driving restricted" tone="error" />
                ) : (
                  <Badge label={user.driverProfile.verificationStatus} tone="info" />
                )}
              </div>
              <div className="spec-grid">
                <div className="spec-item">
                  <div className="spec-item__label">Rating</div>
                  <div className="spec-item__value">{user.driverProfile.ratingAvg.toFixed(2)} ★</div>
                </div>
                <div className="spec-item">
                  <div className="spec-item__label">Trips completed</div>
                  <div className="spec-item__value">{user.driverProfile.tripCount}</div>
                </div>
                <div className="spec-item">
                  <div className="spec-item__label">Reliability penalty</div>
                  <div className="spec-item__value">{user.driverProfile.reliabilityPenaltyPoints}</div>
                </div>
                {user.driverProfile.suspendedAt ? (
                  <div className="spec-item">
                    <div className="spec-item__label">Restriction reason</div>
                    <div className="spec-item__value spec-item__value--muted">
                      {user.driverProfile.suspendedReason ?? '—'}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="card card--flush">
            <div className="section-title" style={{ padding: '20px 24px 12px', margin: 0 }}>
              Rides as driver{' '}
              <span className="section-title__desc">last {ridesAsDriver.length}</span>
            </div>
            {ridesAsDriver.length === 0 ? (
              <EmptyState
                icon="car"
                title="No rides published yet"
                hint="This user hasn't published any rides as a driver."
              />
            ) : (
              <div className="table-wrap">
                <table className="table table--selectable">
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
                        <td className="table__primary">
                          <span className="table__cell-route">
                            <span className="route-pill">
                              <Icon name="route" size={14} />
                            </span>
                            <span className="table__cell-user-main">
                              {ride.originLabel} → {ride.destinationLabel}
                            </span>
                          </span>
                        </td>
                        <td className="table__cell-muted">{formatDate(ride.departureAt)}</td>
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

          <div className="card card--flush">
            <div className="section-title" style={{ padding: '20px 24px 12px', margin: 0 }}>
              Bookings as rider{' '}
              <span className="section-title__desc">last {bookingsAsRider.length}</span>
            </div>
            {bookingsAsRider.length === 0 ? (
              <EmptyState
                icon="person"
                title="No bookings yet"
                hint="This user hasn't booked any rides as a passenger."
              />
            ) : (
              <div className="table-wrap">
                <table className="table table--selectable">
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookingsAsRider.map((booking) => (
                      <tr
                        key={booking.id}
                        onClick={() => booking.rideId && navigate(`/rides/${booking.rideId}`)}
                      >
                        <td className="table__primary">
                          {booking.ride
                            ? `${booking.ride.originLabel} → ${booking.ride.destinationLabel}`
                            : truncateId(booking.rideId)}
                        </td>
                        <td className="table__secondary">
                          {formatCurrency(booking.contributionTotal)}
                        </td>
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

        <div className="detail-rail">
          <div className="card">
            <div className="section-title">Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {user.suspendedAt ? (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setPendingAction('reactivate')}
                >
                  Reactivate account
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => setPendingAction('suspend')}
                >
                  Suspend account
                </button>
              )}
              {user.driverProfile ? (
                user.driverProfile.suspendedAt ? (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setPendingAction('unrestrict')}
                  >
                    Restore driving privileges
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setPendingAction('restrict')}
                  >
                    Restrict driving privileges
                  </button>
                )
              ) : null}
            </div>
            <div className="divider" />
            <p className="section-title__desc" style={{ margin: 0 }}>
              Blocking access requires an explanation, which is recorded to the audit log.
            </p>
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
          onConfirm={(reason) =>
            suspend.mutate(reason ?? '', { onSuccess: () => setPendingAction(null) })
          }
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
          onConfirm={() =>
            reactivate.mutate(undefined, { onSuccess: () => setPendingAction(null) })
          }
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
          onConfirm={(reason) =>
            restrict.mutate(reason ?? '', { onSuccess: () => setPendingAction(null) })
          }
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
          onConfirm={() =>
            unrestrict.mutate(undefined, { onSuccess: () => setPendingAction(null) })
          }
          onCancel={() => setPendingAction(null)}
        />
      ) : null}
    </div>
  );
}
