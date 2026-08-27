# Driver Document Verification — Admin Review Workflow

## Why this exists, and the decision it reverses

Before this change, `drivers.service.ts`'s `createOnboarding` carried this exact comment: *"Auto-approve: no admin review UI in this product (locked product decision)."* Every driver who completed onboarding was synchronously set `verificationStatus: 'approved'` and every submitted document `status: 'approved'`, with no review step ever existing. The schema (`verification_status` enum: `pending`/`approved`/`rejected`) was already review-ready; nothing consumed the non-approved states.

**This document records a deliberate, explicit reversal of that locked decision** — building a real admin verification queue with approve/decline/resubmission was the direct ask for this change, not a casual override. It is called out here, in the implementation commit, and in the top-level progress report, rather than silently changed.

## What already exists and is reused, not rebuilt

- **`verification_documents`** (license/registration/insurance/selfie, with its own per-document `pending`/`approved`/`rejected` status) — unchanged shape, just actually populated with real `pending` rows now instead of always `approved`.
- **Live-camera document capture** (`CaptureCamera.tsx` and its three consumers) — the resubmission flow reuses this exact mechanism; CLAUDE.md explicitly protects "documents en direct — jamais depuis la galerie" as a real differentiator, so resubmission was never going to add a second, gallery-upload-based capture path.
- **`notifyBestEffort`** / the BullMQ dispatch pipeline (Phase 7/8) — every verification-outcome notification reuses it unmodified.
- **`AppError` hierarchy**, the existing per-service ownership-check pattern.

## State machine

```
pending ──┬─→ under_review ──┬─→ approved         (terminal)
          │                  ├─→ rejected          (terminal)
          │                  └─→ resubmission_required ─→ pending (loop)
          ├─→ approved
          ├─→ rejected
          └─→ resubmission_required ─→ pending
```

(`packages/domain/src/driver/verification-transitions.ts`'s `VERIFICATION_STATUS_TRANSITIONS` — `pending` can reach every outcome directly too, since an admin isn't required to explicitly mark something `under_review` before deciding.)

`approved` and `rejected` are deliberately terminal: a rejected driver's only way forward is a fresh onboarding attempt (out of this workflow's scope, not modeled as a transition), while `resubmission_required` is the explicit "fixable, please try again" outcome — the one that loops back to `pending` once the driver re-submits.

Enum values were added additively (`ALTER TYPE verification_status ADD VALUE ...` — migration `0017`) — every driver approved before this feature shipped keeps `verificationStatus: 'approved'` with no review metadata, which is correct: they genuinely were never reviewed by an admin.

## The submission → review → outcome flow

1. **Submission**: `POST /drivers/onboarding` now creates the driver profile as `pending` (`verificationSubmittedAt` set) instead of auto-approving, and documents as `pending`. The driver gets a `verification_submitted` notification ("submitted, no further action needed right now" — CLAUDE.md's exact UX ask).
2. **Admin queue**: `GET /admin/verifications?status=pending` (the default view, combining `pending`+`under_review`) — shows submission date, document types, and a `countsByStatus` summary for the operational-queue-health glance the brief asks for.
3. **Review detail**: `GET /admin/verifications/:id` — user profile, driver profile, every submitted document (with secured, admin-only access to the files — see Document security below), vehicle info, and full review history (see Audit trail below).
4. **Decision**:
   - **Approve** (`POST /admin/verifications/:id/approve`, optional internal `notes`) → `approved`, `approvedAt` set, driver immediately eligible (see Eligibility enforcement below), `verification_approved` notification sent.
   - **Decline** (`POST /admin/verifications/:id/decline`, body `{outcome: 'rejected'|'resubmission_required', reason: <one of 7 structured reasons>, message: <required, user-facing>, notes?}`) → the structured `reason` (`document_unclear`/`expired`/`information_mismatch`/`missing_document`/`invalid_document`/`additional_info_required`/`other`) plus a **required** free-text `message` that is what the driver actually reads — CLAUDE.md's "never simply tell the user rejected without explaining what to fix" is enforced by the schema itself (`message` is not optional), not left to admin discipline. `notes` is separate and **never** returned by any user-facing endpoint — internal-only, for the next reviewer or an audit trail entry.
5. **Resubmission** (only reachable from `resubmission_required`): `POST /drivers/verification/resubmit` — replaces the document rows, increments `verificationAttempt`, resets to `pending`, clears the prior decline reason/message, re-notifies. The driver's other profile/vehicle data is untouched — CLAUDE.md's "preserve valid information so the user doesn't have to redo unnecessary work."

## Eligibility enforcement — server-side, not just UI gating

`rides.service.ts`'s `createRide` (via `getDriverProfileOrThrow`) now rejects ride creation unless `verificationStatus === 'approved'` **and** `!suspendedAt` (the separate driver-privilege-restriction flag, below) — independent of whatever the mobile client's own `isVerifiedDriver` gate shows. This is the same "server-authoritative, never trust client UI alone" discipline CLAUDE.md already applies to pricing bounds, extended to verification. Before this change the check existed in the mobile client only and, per its own code comment, "in practice only ever fires for 'hasn't onboarded yet' — never a real pending/rejected profile," because nothing ever produced a real pending/rejected profile. It does now, so the server-side half of this gate is no longer a formality.

## Driver-privilege restriction — a separate axis from verification

`driver_profiles.suspendedAt`/`suspendedReason` is a distinct admin action (`POST /admin/users/:id/restrict-driver`/`unrestrict-driver`) from verification status — an approved, previously-trustworthy driver can have driving privileges restricted (e.g. following a safety report) without re-litigating their document verification. Checked in the same `getDriverProfileOrThrow` gate. Account-level suspension (`users.suspendedAt`, blocking all API access including riding) is a third, broader axis — enforced in the global `authenticate` hook itself, ahead of any route-specific logic.

## Document security

- **Fixed a real gap found while building this**: avatar/vehicle-photo uploads and driver KYC documents (license/registration/insurance/selfie) originally shared one `POST /uploads` endpoint whose files were served from the API's own `/uploads/` **public** static prefix (`@fastify/static`, no auth at all) — reachable by anyone who ever learned the URL, forever, regardless of the fact that every endpoint *returning* that URL (`GET /drivers/me`, the admin verification queue/detail) was itself correctly gated. Random UUID filenames made this obscurity-based, not actually secured.
- KYC documents now go through a separate `POST /uploads/secure` endpoint (`StorageAdapter.saveSecure`, `local-disk-storage-adapter.ts`) that writes to `secure-uploads/` — a directory deliberately never registered under `@fastify/static`, so no URL can ever serve it directly. The only read path is `StorageAdapter.readSecure`, called from two authenticated, streaming-only endpoints: `GET /admin/verifications/documents/:id/file` (`authenticateAdmin`) and `GET /drivers/me/documents/:id/file` (`authenticate` + ownership check — a mismatched driver is a 404, not a 403, so the endpoint never confirms a document id exists to a caller who doesn't own it). Neither endpoint ever returns the underlying file path or a bookmarkable URL — the response *is* the image bytes.
- Avatar/vehicle-photo uploads are unchanged (`POST /uploads`, still publicly served) — those are meant to be visible to matched counterparts, unlike KYC documents.
- `readSecure` also checks the legacy public `uploads/` directory as a fallback, so a document submitted before this fix (already resolvable at its original public URL) doesn't 404 through the new endpoints — a real backward-compatibility case, not a hole: the old URL still works exactly as before for anyone who already had it, which this change can't retroactively revoke without breaking already-approved drivers' stored `fileUrl` values.
- No document content is ever logged; `verification_admin_notes` (freeform, internal) is the only place an admin's own commentary is persisted, and it's explicitly excluded from every response schema a non-admin caller could ever see.

## Audit trail

Every approve/decline/resubmission-request writes an `audit_logs` row (`VERIFICATION_APPROVED`/`VERIFICATION_DECLINED`/`VERIFICATION_RESUBMISSION_REQUESTED`, with `previousState`/`newState` and the decline reason+message folded into `reason`). This doubles as the "previous verification attempts" / review-history requirement the brief asks for — deliberately not a second, dedicated history table: `listAuditLogs(db, 'driver_profile', driverProfileId)` is the query the review-detail endpoint already uses.

## Known limitations, stated plainly

- **Per-submission decline, not per-document.** `reason`/`message` are attached to the whole verification attempt, not to an individual document (e.g. "your license photo specifically is blurry" vs. "your insurance proof specifically is expired" as two independent findings on one submission). A real product could go further here; this is a deliberate v1 scope decision, not an oversight — the structured `reason` enum already covers the common single-cause cases, and the free-text `message` can name the specific document when a reviewer needs to.
- **No document-type-specific front/back modeling** beyond what `verification_documents.type` already distinguishes (license/registration/insurance/selfie) — a document type that genuinely needs two images (e.g. license front+back) isn't specially modeled; this mirrors the pre-existing capture flow's own scope, unchanged here.
- **Verified against real infrastructure**: the full submit → admin-queue → decline-with-resubmission → driver-resubmits → admin-approve → terminal-state-rejection path was exercised end-to-end via real HTTP requests (`app.inject`) against a real Postgres instance — see `apps/api/src/modules/admin/__tests__/admin-verification.integration.test.ts`.
