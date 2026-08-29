import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DECLINE_REASON_LABELS,
  useApproveVerification,
  useDeclineVerification,
  useVerificationDetail,
} from '../api/hooks/verifications';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { VerificationStatusBadge } from '../components/Badge';
import { SecureDocumentImage } from '../components/SecureDocumentImage';
import { Icon } from '../components/Icon';
import { formatDate, humanize } from '../utils/format';
import type { VerificationDeclineReason } from '../api/types';

type ReviewAction = 'approve' | 'decline' | null;

export function VerificationDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useVerificationDetail(id);
  const [action, setAction] = useState<ReviewAction>(null);

  if (isLoading) return <LoadingBlock rows={10} />;
  if (isError || !data)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Verification not found'}
        onRetry={() => refetch()}
      />
    );

  const { profile, history } = data;
  const reviewable =
    profile.verificationStatus === 'pending' || profile.verificationStatus === 'under_review';

  return (
    <div>
      <button type="button" className="back-link" onClick={() => navigate('/verifications')}>
        <Icon name="arrowLeft" size={15} />
        Back to queue
      </button>

      <div className="hero-band" style={{ marginBottom: 20 }}>
        <div className="hero-band__content">
          <div className="hero-band__eyebrow">
            <Icon name="shield" size={14} /> Driver verification
          </div>
          <div className="hero-band__title" style={{ fontSize: 'var(--text-2xl)' }}>
            {profile.user?.fullName ?? 'Driver'}
          </div>
          <div className="hero-band__sub">
            Submitted {formatDate(profile.verificationSubmittedAt)} · attempt #
            {profile.verificationAttempt}
          </div>
        </div>
        <div className="hero-band__stats">
          <div className="hero-stat">
            <div className="hero-stat__value" style={{ fontSize: 20, paddingTop: 8 }}>
              <VerificationStatusBadge status={profile.verificationStatus} />
            </div>
            <div className="hero-stat__label">Status</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat__value">{profile.documents.length}</div>
            <div className="hero-stat__label">Documents</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat__value">{profile.vehicles.length}</div>
            <div className="hero-stat__label">Vehicles</div>
          </div>
        </div>
        {profile.verificationDeclineReason ? (
          <div className="alert-inline" style={{ marginTop: 16, width: '100%', flexBasis: '100%' }}>
            <Icon name="alert" size={15} />
            <div>
              <strong>Last decline:</strong>{' '}
              {DECLINE_REASON_LABELS[profile.verificationDeclineReason]}
              {profile.verificationDeclineMessage ? ` — ${profile.verificationDeclineMessage}` : ''}
            </div>
          </div>
        ) : null}
      </div>

      <div className="detail-grid">
        <div className="detail-stack">
          <div className="card">
            <div className="section-title">Driver</div>
            <div className="spec-grid">
              <div className="spec-item">
                <div className="spec-item__label">Phone</div>
                <div className="spec-item__value">{profile.user?.phone ?? '—'}</div>
              </div>
              <div className="spec-item">
                <div className="spec-item__label">Email</div>
                <div className="spec-item__value spec-item__value--muted">
                  {profile.user?.email ?? '—'}
                </div>
              </div>
              {profile.bio ? (
                <div className="spec-item">
                  <div className="spec-item__label">Bio</div>
                  <div className="spec-item__value spec-item__value--muted">{profile.bio}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="card">
            <div className="section-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="car" size={16} style={{ color: 'var(--color-accent-deep)' }} />
                Vehicle
              </span>
            </div>
            {profile.vehicles.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13 }}>
                No vehicle on file.
              </p>
            ) : (
              <div className="spec-grid">
                {profile.vehicles.map((v) => (
                  <div className="spec-item" key={v.id}>
                    <div className="spec-item__label">
                      {v.make} {v.model} · {v.color}
                    </div>
                    <div className="spec-item__value mono">{v.plateNumber}</div>
                    <div className="spec-item__label" style={{ marginTop: 8 }}>
                      Seats
                    </div>
                    <div className="spec-item__value">{v.seatCount}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="document" size={16} style={{ color: 'var(--color-accent-deep)' }} />
                Submitted documents
              </span>
              <span className="section-title__desc">{profile.documents.length}</span>
            </div>
            {profile.documents.length === 0 ? (
              <EmptyState icon="document" title="No documents submitted" />
            ) : (
              <div className="doc-grid">
                {profile.documents.map((doc) => (
                  <div className="doc-card" key={doc.id}>
                    <div className="doc-card__label">
                      {doc.type}
                      {doc.status === 'approved' ? ' · ✓' : doc.status === 'rejected' ? ' · ✕' : ''}
                    </div>
                    <SecureDocumentImage documentId={doc.id} alt={`${doc.type} document`} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card card--flush">
            <div className="section-title" style={{ padding: '20px 24px 12px', margin: 0 }}>
              Review history
            </div>
            {history.length === 0 ? (
              <EmptyState
                icon="clock"
                title="No prior review actions"
                hint="Nothing has been recorded for this driver yet."
              />
            ) : (
              <div className="kv-list" style={{ padding: '0 24px 16px' }}>
                {history.map((log) => (
                  <div className="kv-row" key={log.id}>
                    <span className="kv-row__label">
                      {humanize(log.action)} — {log.adminUser?.fullName ?? 'admin'}
                    </span>
                    <span className="kv-row__value">{formatDate(log.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="detail-rail">
          <div className="card">
            <div className="section-title">Decision</div>
            {reviewable ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => setAction('approve')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() => setAction('decline')}
                  >
                    Decline / request resubmission
                  </button>
                </div>
                <p className="section-title__desc" style={{ marginTop: 12 }}>
                  Approving lets the driver publish rides immediately. Both actions are recorded in
                  the audit log.
                </p>
              </>
            ) : (
              <p className="section-title__desc" style={{ margin: 0 }}>
                This verification is already {humanize(profile.verificationStatus).toLowerCase()}{' '}
                and is no longer actionable.
              </p>
            )}
          </div>
        </div>
      </div>

      {action === 'approve' ? (
        <ApproveDialog driverProfileId={profile.id} onClose={() => setAction(null)} />
      ) : null}
      {action === 'decline' ? (
        <DeclineDialog driverProfileId={profile.id} onClose={() => setAction(null)} />
      ) : null}
    </div>
  );
}

function ApproveDialog({
  driverProfileId,
  onClose,
}: {
  driverProfileId: string;
  onClose: () => void;
}): React.JSX.Element {
  const [notes, setNotes] = useState('');
  const approve = useApproveVerification(driverProfileId);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Approve this driver?</h3>
        <p className="modal__body">
          The driver will be notified and can immediately publish rides. This action is recorded in
          the audit log.
        </p>
        <div className="field">
          <label className="field__label" htmlFor="approve-notes">
            Internal notes (optional, never shown to the driver)
          </label>
          <textarea
            id="approve-notes"
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
        {approve.isError ? (
          <p className="field__error">{(approve.error as Error).message}</p>
        ) : null}
        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={approve.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={approve.isPending}
            onClick={() => approve.mutate(notes.trim() || undefined, { onSuccess: onClose })}
          >
            {approve.isPending ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

const REASONS = Object.keys(DECLINE_REASON_LABELS) as VerificationDeclineReason[];

function DeclineDialog({
  driverProfileId,
  onClose,
}: {
  driverProfileId: string;
  onClose: () => void;
}): React.JSX.Element {
  const [outcome, setOutcome] = useState<'resubmission_required' | 'rejected'>(
    'resubmission_required',
  );
  const [reason, setReason] = useState<VerificationDeclineReason>('document_unclear');
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const decline = useDeclineVerification(driverProfileId);

  const messageValid = message.trim().length > 0;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Decline this verification</h3>

        <div className="field">
          <label className="field__label">Outcome</label>
          <select
            className="select"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as typeof outcome)}
          >
            <option value="resubmission_required">Ask for resubmission (fixable)</option>
            <option value="rejected">Reject outright (terminal)</option>
          </select>
          <span className="field__hint">
            {outcome === 'resubmission_required'
              ? 'The driver can fix the issue and resubmit their documents.'
              : 'This is terminal — the driver cannot resubmit; they would need a fresh onboarding.'}
          </span>
        </div>

        <div className="field">
          <label className="field__label">Reason</label>
          <select
            className="select"
            value={reason}
            onChange={(e) => setReason(e.target.value as VerificationDeclineReason)}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {DECLINE_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="decline-message">
            Message to the driver (required)
          </label>
          <textarea
            id="decline-message"
            className="textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onBlur={() => setTouched(true)}
            rows={3}
            placeholder="Explain specifically what to fix — this is what the driver actually reads."
          />
          {touched && !messageValid ? (
            <p className="field__error">A message to the driver is required.</p>
          ) : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="decline-notes">
            Internal notes (optional, never shown to the driver)
          </label>
          <textarea
            id="decline-notes"
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        {decline.isError ? (
          <p className="field__error">{(decline.error as Error).message}</p>
        ) : null}

        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={decline.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={!messageValid || decline.isPending}
            onClick={() => {
              setTouched(true);
              if (!messageValid) return;
              decline.mutate(
                { outcome, reason, message: message.trim(), notes: notes.trim() || undefined },
                { onSuccess: onClose },
              );
            }}
          >
            {decline.isPending ? 'Submitting…' : 'Submit decision'}
          </button>
        </div>
      </div>
    </div>
  );
}
