import type { Dictionary } from '@/i18n/dictionaries';
import { ScrollSequence, type Beat } from './ScrollSequence';

const Copy = ({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }): React.JSX.Element => (
  <div className="max-w-md">
    {eyebrow && <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-accent">{eyebrow}</p>}
    <h3 className="balance font-display text-3xl leading-[1.08] text-ink md:text-5xl">{title}</h3>
    {body && <p className="mt-4 text-base leading-relaxed text-ink-muted md:text-lg">{body}</p>}
  </div>
);

/** Scene 4 — identity, licence and vehicle checks lock into one verified shield. */
export function TrustScene({ dict }: { dict: Dictionary }): React.JSX.Element {
  const t = dict.trust;
  const c = dict.cinema;
  // frame windows from blender/scene_trust.py, as progress (frame-1)/159
  const beats: Beat[] = [
    { from: 0.0, to: 0.12, position: 'bottomLeft', children: <Copy eyebrow={t.eyebrow} title={c.trustIntro} /> },
    { from: 0.13, to: 0.29, position: 'bottomLeft', children: <Copy eyebrow="01" title={t.points[0]!.title} body={t.points[0]!.body} /> },
    { from: 0.36, to: 0.51, position: 'bottomLeft', children: <Copy eyebrow="02" title={c.licenceTitle} body={c.licenceBody} /> },
    { from: 0.59, to: 0.73, position: 'bottomLeft', children: <Copy eyebrow="03" title={c.vehicleTitle} body={c.vehicleBody} /> },
    { from: 0.84, to: 1, holdEnd: true, position: 'left', children: <Copy title={t.title} body={t.body} /> },
  ];
  return (
    <ScrollSequence
      id="trust"
      name="trust"
      frames={160}
      lengthVh={480}
      focusX={0.68}
      beats={beats}
      backdrop={
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 40% 50% at 64% 55%, rgba(63,190,133, calc(0.04 + var(--p, 0) * 0.14)) 0%, transparent 70%), #0D1512',
          }}
        />
      }
    />
  );
}
