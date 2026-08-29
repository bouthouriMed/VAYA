import { useState, type ReactNode } from 'react';

interface ConfirmModalProps {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  /** When set, a required free-text reason field is shown and passed to onConfirm. */
  requireReason?: boolean;
  reasonLabel?: string;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  body,
  confirmLabel = 'Confirm',
  tone = 'primary',
  requireReason = false,
  reasonLabel = 'Reason',
  isSubmitting = false,
  errorMessage,
  onConfirm,
  onCancel,
}: ConfirmModalProps): React.JSX.Element {
  const [reason, setReason] = useState('');
  const canSubmit = !requireReason || reason.trim().length > 0;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">{title}</h3>
        <div className="modal__body">{body}</div>
        {requireReason ? (
          <div className="field">
            <label className="field__label" htmlFor="confirm-reason">
              {reasonLabel}
            </label>
            <textarea
              id="confirm-reason"
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explain why — this may be visible to the affected user."
            />
          </div>
        ) : null}
        {errorMessage ? (
          <div
            className="state-block__hint"
            style={{ color: 'var(--color-error)', marginBottom: 8 }}
          >
            {errorMessage}
          </div>
        ) : null}
        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
