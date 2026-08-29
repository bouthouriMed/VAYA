export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export function Badge({
  label,
  tone = 'neutral',
  dot = true,
}: {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
}): React.JSX.Element {
  return (
    <span className={`badge badge--${tone}`}>
      {dot ? <span className="badge__dot" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

const RIDE_STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  published: 'info',
  full: 'warning',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'error',
};

const BOOKING_STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'error',
  cancelled_by_rider: 'neutral',
  cancelled_by_driver: 'error',
  expired: 'neutral',
  completed: 'success',
  no_show: 'error',
};

const VERIFICATION_STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  under_review: 'info',
  approved: 'success',
  rejected: 'error',
  resubmission_required: 'warning',
};

const REPORT_STATUS_TONE: Record<string, BadgeTone> = {
  open: 'warning',
  investigating: 'info',
  resolved: 'success',
  dismissed: 'neutral',
};

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RideStatusBadge({ status }: { status: string }): React.JSX.Element {
  return <Badge label={humanize(status)} tone={RIDE_STATUS_TONE[status] ?? 'neutral'} />;
}

export function BookingStatusBadge({ status }: { status: string }): React.JSX.Element {
  return <Badge label={humanize(status)} tone={BOOKING_STATUS_TONE[status] ?? 'neutral'} />;
}

export function VerificationStatusBadge({ status }: { status: string }): React.JSX.Element {
  return <Badge label={humanize(status)} tone={VERIFICATION_STATUS_TONE[status] ?? 'neutral'} />;
}

export function ReportStatusBadge({ status }: { status: string }): React.JSX.Element {
  return <Badge label={humanize(status)} tone={REPORT_STATUS_TONE[status] ?? 'neutral'} />;
}
