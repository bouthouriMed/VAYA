/**
 * Guards against the exact class of bug found in the 2026-09-10 production
 * audit: `drizzle/0019_silent_crystal.sql` existed on disk, containing a
 * real schema change (`ALTER TYPE notification_event_type ADD VALUE
 * 'rating_received'`), but was never registered in `meta/_journal.json` —
 * so `drizzle-kit migrate` silently never applied it, while application
 * code already depended on the value existing. Nothing caught this because
 * nothing checked that every `.sql` file on disk is actually reachable by
 * the migration runner.
 *
 * This script is the check that would have caught it: every migration file
 * must have exactly one journal entry (hard failure otherwise — this is
 * what actually breaks `drizzle-kit migrate`, which reads only the journal
 * + the .sql files, never the filesystem directly), every journal entry
 * must point at a file that exists, and entries must be contiguous from 0
 * with no gaps/dupes.
 *
 * A journal entry with no matching `meta/NNNN_snapshot.json` is reported as
 * a WARNING, not a failure: `migrate` doesn't read snapshots at all (only
 * `generate` does, to compute the *next* diff), so a missing snapshot can't
 * silently break what's already applied — but it does mean a future
 * `db:generate` may not see that migration's schema change, which matters
 * most for a migration whose columns were deliberately hand-written outside
 * the Drizzle TS schema (e.g. `0014_postgis_spatial_columns.sql`'s raw
 * PostGIS generated columns — never declared in `db/schema/*.ts`, so
 * drizzle-kit was never going to track them regardless of a snapshot file).
 *
 * Run via `pnpm --filter @vaya/api verify-migrations` (wired into CI).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = path.resolve(__dirname, '../drizzle');
const META_DIR = path.join(DRIZZLE_DIR, 'meta');
const JOURNAL_PATH = path.join(META_DIR, '_journal.json');

interface JournalEntry {
  idx: number;
  tag: string;
}

interface Journal {
  entries: JournalEntry[];
}

function main(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(JOURNAL_PATH)) {
    console.error(`✗ verify-migrations: journal not found at ${JOURNAL_PATH}`);
    process.exit(1);
  }

  const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf-8')) as Journal;
  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);

  // 1. Contiguous idx from 0, no gaps, no duplicates.
  entries.forEach((entry, position) => {
    if (entry.idx !== position) {
      errors.push(
        `Journal entry #${position} has idx=${entry.idx} (expected ${position}) — gap or out-of-order entry for tag "${entry.tag}".`,
      );
    }
  });

  // 2. Every journal entry's .sql file actually exists.
  const journalTags = new Set(entries.map((e) => e.tag));
  for (const entry of entries) {
    const sqlPath = path.join(DRIZZLE_DIR, `${entry.tag}.sql`);
    if (!existsSync(sqlPath)) {
      errors.push(`Journal entry idx=${entry.idx} ("${entry.tag}") has no matching file: ${sqlPath}`);
    }
    const snapshotPath = path.join(META_DIR, `${String(entry.idx).padStart(4, '0')}_snapshot.json`);
    if (!existsSync(snapshotPath)) {
      warnings.push(
        `Journal entry idx=${entry.idx} ("${entry.tag}") has no matching snapshot (${snapshotPath}) — fine if this migration's changes are deliberately outside the Drizzle TS schema (see file header), otherwise the next "db:generate" won't see them.`,
      );
    }
  }

  // 3. Every .sql file on disk is reachable via the journal — this is the
  // exact check that would have caught 0019_silent_crystal.sql.
  const sqlFiles = readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith('.sql'));
  for (const file of sqlFiles) {
    const tag = file.replace(/\.sql$/, '');
    if (!journalTags.has(tag)) {
      errors.push(
        `Orphaned migration file "${file}" exists on disk but has NO journal entry — drizzle-kit migrate will NEVER apply it. Either add it to _journal.json with the correct idx, or delete it if superseded.`,
      );
    }
  }

  if (warnings.length > 0) {
    console.warn(`⚠ verify-migrations: ${warnings.length} warning(s):\n`);
    for (const warning of warnings) console.warn(`  - ${warning}`);
    console.warn('');
  }

  if (errors.length > 0) {
    console.error(`✗ verify-migrations: ${errors.length} problem(s) found:\n`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log(`✓ verify-migrations: ${entries.length} migrations, all journaled and file-backed.`);
}

main();
