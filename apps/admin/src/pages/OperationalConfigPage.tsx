import { useEffect, useState } from 'react';
import { useOperationalConfig, useUpdateOperationalConfig } from '../api/hooks/operationalConfig';
import { LoadingBlock, ErrorState } from '../components/States';
import type { OperationalConfig } from '../api/types';

interface FieldDef {
  key: keyof OperationalConfig;
  label: string;
  help: string;
  step?: string;
}

// docs/unified_driver_and_passenger_journey.md §28's own example list, plus
// every threshold this codebase's domain layer treats as "a first-cut
// default, not a settled product number" (existing-passenger-impact,
// cancellation/no-show, route deviation, request deadline, same-journey
// grouping) — grouped to match the spec's own section structure.
const SECTIONS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Matching',
    fields: [
      {
        key: 'maxDetourRatio',
        label: 'Max detour ratio',
        help: 'Fraction of baseline trip duration a detour may add (0–1).',
        step: '0.01',
      },
    ],
  },
  {
    title: 'Existing passenger protection (§27)',
    fields: [
      {
        key: 'existingPassengerMaxDelayRatio',
        label: 'Max delay ratio',
        help: 'Fraction of an existing passenger’s remaining trip a new request may add (0–1).',
        step: '0.01',
      },
      {
        key: 'existingPassengerMaxAbsoluteDelayMinutes',
        label: 'Max absolute delay (minutes)',
        help: 'Hard ceiling regardless of ratio, for very long trips.',
      },
    ],
  },
  {
    title: 'Cancellation (§36/§38)',
    fields: [
      { key: 'cancellationFreeWindowHours', label: 'Free-cancellation window (hours)', help: 'At/above this, cancelling has no reliability consequence.' },
      { key: 'cancellationModerateWindowMinutes', label: 'Moderate window (minutes)', help: 'Below the free window but at/above this: moderate penalty. Below it: severe.' },
    ],
  },
  {
    title: 'No-show (§37)',
    fields: [
      { key: 'noShowMinMinutesAfterDeparture', label: 'Grace period after departure (minutes)', help: 'A no-show cannot be reported before this much time has passed.' },
      { key: 'noShowMaxReporterDistanceMeters', label: 'Max reporter distance (meters)', help: 'The reporter must be within this distance of the meeting point.' },
    ],
  },
  {
    title: 'Route deviation (§29/§51)',
    fields: [
      { key: 'routeDeviationNoiseThresholdMeters', label: 'Noise threshold (meters)', help: 'Below this, GPS drift is never treated as a route change.' },
      { key: 'routeDeviationRealThresholdMeters', label: 'Real-deviation threshold (meters)', help: 'At/above this, it is treated as a genuine reroute.' },
    ],
  },
  {
    title: 'Request deadline & grouping (§20)',
    fields: [
      { key: 'bookingResponseWindowMinutes', label: 'Response window (minutes)', help: 'How long a driver has to respond before a request expires.' },
      { key: 'sameJourneyPickupRadiusMeters', label: 'Same-journey pickup radius (meters)', help: 'Requests within this pickup radius may be grouped as the same journey.' },
      { key: 'sameJourneyDropoffRadiusMeters', label: 'Same-journey dropoff radius (meters)', help: 'Requests within this dropoff radius may be grouped as the same journey.' },
      { key: 'sameJourneyTimeWindowMinutes', label: 'Same-journey time window (minutes)', help: 'Requests made this close together may be grouped as the same journey.' },
      { key: 'maxActiveRequestsPerJourney', label: 'Max active requests per journey', help: 'How many drivers a passenger may request simultaneously for one journey.' },
    ],
  },
];

/**
 * VAYA Operational Policy Configuration
 * (docs/unified_driver_and_passenger_journey.md §28, M-085/M-086): "The
 * Admin Panel is the authoritative interface for setting and changing
 * these values." Not exposed to passengers or ordinary drivers anywhere in
 * this app — this page IS that interface, the first and only place any of
 * these thresholds can be changed without a code deploy.
 */
export function OperationalConfigPage(): React.JSX.Element {
  const { data, isLoading, isError, error, refetch } = useOperationalConfig();
  const update = useUpdateOperationalConfig();
  const [draft, setDraft] = useState<Partial<OperationalConfig>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (isLoading) {
    return (
      <div className="card card--flush" style={{ padding: 20 }}>
        <LoadingBlock rows={10} />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="card card--flush" style={{ padding: 20 }}>
        <ErrorState message={(error as Error)?.message ?? 'Failed to load configuration'} onRetry={() => refetch()} />
      </div>
    );
  }

  function setField(key: keyof OperationalConfig, raw: string): void {
    const value = raw === '' ? undefined : Number(raw);
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave(): void {
    if (!data) return;
    setSavedAt(null);
    const changed: Partial<OperationalConfig> = {};
    for (const section of SECTIONS) {
      for (const f of section.fields) {
        const value = draft[f.key];
        if (typeof value === 'number' && Number.isFinite(value) && value !== data[f.key]) {
          (changed as Record<string, number>)[f.key] = value;
        }
      }
    }
    if (Object.keys(changed).length === 0) return;
    update.mutate(changed, { onSuccess: () => setSavedAt(Date.now()) });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <p style={{ margin: 0, color: 'var(--color-gray-600)' }}>
          These thresholds are VAYA-owned operational policy — never exposed to passengers or ordinary drivers.
          Changing a value here takes effect immediately for new requests/matches, without a code deploy. Every
          change is recorded in the <a href="/audit-log">audit log</a>.
        </p>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.title} className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{section.title}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {section.fields.map((f) => (
              <div className="field" key={f.key}>
                <label className="field__label" htmlFor={f.key}>
                  {f.label}
                </label>
                <input
                  id={f.key}
                  className="input"
                  type="number"
                  step={f.step ?? '1'}
                  min={0}
                  value={draft[f.key] ?? ''}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-gray-500)' }}>{f.help}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {update.isError ? <p className="field__error">{(update.error as Error).message}</p> : null}
      {savedAt ? <p style={{ color: 'var(--color-success, green)' }}>Saved.</p> : null}

      <div>
        <button type="button" className="btn btn--primary" disabled={update.isPending} onClick={handleSave}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
