import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DECLINE_REASON_LABELS,
  useApproveVerification,
  useDeclineVerification,
  useVerificationDetail,
} from '../api/hooks/verifications';
import { LoadingBlock, ErrorState } from '../components/States';
import { VerificationStatusBadge } from '../components/Badge';
import { SecureDocumentImage } from '../components/SecureDocumentImage';
import { formatDate, humanize } from '../utils/format';
import type { VerificationDeclineReason } from '../api/types';

type ReviewAction = 'approve' | 'decline' | null;

export function VerificationDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useVerificationDetail(id);
  const [action, setAction] = useState<ReviewAction>(null);

  if (isLoading) return <LoadingBlock rows={10} />;
  if (isError || !data) return <ErrorState message={error instanceof Error ? error.message : 'Verification not found'} onRetry={() => refetch()} />;

  const { profile, history } = data;
  const reviewable = profile.verificationStatus === 'pending' || profile.verificationStatus === 'under_review';

  return (
    <div>
      <button type="button" className="link-button" onClick={() => navigate('/verifications')} style={{ marginBottom: 16 }}>
        ← Back to queue
      </button>

      <div className="detail-grid">
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">
              {profile.user?.fullName ?? 'Driver'}
              <VerificationStatusBadge status={profile.verificationStatus} />
            </div>
            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-row__label">Phone</span>
                <span className="kv-row__value">{profile.user?.phone ?? '—'}</span>
              </div>
              <div className="kv-row">
                <span className="kv-row__label">Submitted</span>
                <span className="kv-row__value">{formatDate(profile.verificationSubmittedAt)}</span>
              </div>
              <div className="kv-row">
                <span className="kv-row__label">Attempt</span>
                <span className="kv-row__value">#{profile.verificationAttempt}</span>
              </div>
              {profile.bio ? (
                <div className="kv-row">
                  <span className="kv-row__label">Bio</span>
                  <span className="kv-row__value">{profile.bio}</span>
                </div>
              ) : null}
              {profile.verificationDeclineReason ? (
                <div className="kv-row">
                  <span className="kv-row__label">Last decline reason</span>
                  <span className="kv-row__value">{DECLINE_REASON_LABELS[profile.verificationDeclineReason]}</span>
                </div>
              ) : null}
              {profile.verificationDeclineMessage ? (
                <div className="kv-row">
                  <span className="kv-row__label">Last decline message</span>
                  <span className="kv-row__value">{profile.verificationDeclineMessage}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">Vehicle</div>
            {profile.vehicles.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13 }}>No vehicle on file.</p>
            ) : (
              profile.vehicles.map((v) => (
                <div className="kv-list" key={v.id}>
                  <div className="kv-row">
                    <span className="kv-row__label">Vehicle</span>
                    <span className="kv-row__value">
                      {v.make} {v.model} · {v.color}
                    </span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-row__label">Plate</span>
                    <span className="kv-row__value">{v.plateNumber}</span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-row__label">Seats</span>
                    <span className="kv-row__value">{v.seatCount}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">Submitted documents ({profile.documents.length})</div>
            {profile.documents.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13 }}>No documents submitted.</p>
            ) : (
              <div className="doc-grid">
                {profile.documents.map((doc) => (
                  <div className="doc-card" key={doc.id}>
                    <div className="doc-card__label">{doc.type}</div>
                    <SecureDocumentImage documentId={doc.id} alt={`${doc.type} document`} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="section-title">Review history</div>
            {history.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13 }}>No prior review actions on this driver.</p>
            ) : (
              <div className="kv-list">
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

        <div className="card">
          <div className="section-title">Decision</div>
          {reviewable ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button type="button" className="btn btn--secondary" onClick={() => setAction('approve')}>
                Approve
              </button>
              <button type="button" className="btn btn--danger" onClick={() => setAction('decline')}>
                Decline / request resubmission
              </button>
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: 13 }}>
              This verification is already {humanize(profile.verificationStatus).toLowerCase()} and is no longer
              actionable.
            </p>
          )}
        </div>
      </div>

      {action === 'approve' ? <ApproveDialog driverProfileId={profile.id} onClose={() => setAction(null)} /> : null}
      {action === 'decline' ? <DeclineDialog driverProfileId={profile.id} onClose={() => setAction(null)} /> : null}
    </div>
  );
}

function ApproveDialog({ driverProfileId, onClose }: { driverProfileId: string; onClose: () => void }): React.JSX.Element {
  const [notes, setNotes] = useState('');
  const approve = useApproveVerification(driverProfileId);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">Approve this driver?</h3>
        <p className="modal__body">
          The driver will be notified and can immediately publish rides. This action is recorded in the audit log.
        </p>
        <div className="field">
          <label className="field__label" htmlFor="approve-notes">
            Internal notes (optional, never shown to the driver)
          </label>
          <textarea id="approve-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        {approve.isError ? <p className="field__error">{(approve.error as Error).message}</p> : null}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={approve.isPending}>
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

function DeclineDialog({ driverProfileId, onClose }: { driverProfileId: string; onClose: () => void }): React.JSX.Element {
  const [outcome, setOutcome] = useState<'resubmission_required' | 'rejected'>('resubmission_required');
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
          <select className="select" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
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
          <select className="select" value={reason} onChange={(e) => setReason(e.target.value as VerificationDeclineReason)}>
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
          {touched && !messageValid ? <p className="field__error">A message to the driver is required.</p> : null}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="decline-notes">
            Internal notes (optional, never shown to the driver)
          </label>
          <textarea id="decline-notes" className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>

        {decline.isError ? <p className="field__error">{(decline.error as Error).message}</p> : null}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={decline.isPending}>
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
