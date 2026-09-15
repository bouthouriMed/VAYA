# Legal documentation

- [`terms-and-conditions.md`](./terms-and-conditions.md) — VAYA's Terms & Conditions
  ("CGU"), canonical French text.
- [`privacy-policy.md`](./privacy-policy.md) — VAYA's Privacy Policy ("Politique de
  confidentialité"), canonical French text.

Both documents are consumed as structured content in `packages/legal/src/{terms,privacy}.ts`
(`fr`/`en`/`ar` — see that module's own header comment for how it relates to these canonical
`.md` files), a shared package with two real consumers so the text can never drift between
them:

- **Mobile app**: `apps/mobile/app/legal/{terms,privacy}.tsx`, linked from the sign-in
  screen's acceptance text and from the profile screen's "Conditions et vie privée" row.
- **Marketing website**: `apps/website/src/app/[locale]/legal/{terms,privacy}/page.tsx`
  (fr/en only — the website has no Arabic locale), statically generated at build time,
  linked from the site footer's "Conditions"/"Confidentialité" links. **This is the real
  public URL App Store/Play Store submission needs** — confirmed by an actual
  `pnpm --filter @vaya/website build`, which generates real static HTML at
  `/fr/legal/terms`, `/en/legal/terms`, `/fr/legal/privacy`, `/en/legal/privacy`. It only
  satisfies the store requirement once the website itself is deployed to a real,
  permanently-reachable domain (tracked as infrastructure work in `LAUNCH_ACTIONS.md`, not
  a content or code gap anymore).

## Governing language

**French is the authoritative language for both documents.** The English and Arabic
in-app versions are faithful translations for accessibility, not independent legal texts —
in case of any conflict, the French version in this folder governs. This mirrors how the
rest of the app already treats French as `DEFAULT_LOCALE` (`packages/config`).

## Why this drafting approach, in one paragraph

Tunisia has no carpooling-specific statute. Existing land-transport law (Loi n°2004-33) is
read by multiple independent Tunisian sources as treating *paid* carpooling as unlicensed
("clandestine") passenger transport unless it stays strictly cost-sharing and non-profit —
there is real, currently-enforced risk here (a cited 700 TND fine + vehicle-seizure
precedent against individuals, and the 2025 Bolt/Yassir/Heetch ride-hailing suspensions,
though those were framed around tax/licensing issues for a genuinely commercial model, not
cost-sharing carpooling). BlaBlaCar's own legal posture — "we are a technical intermediary,
never a carrier; the driver's contribution is capped to actual trip cost, never profit" —
is the internationally-recognized way carpooling platforms establish this distinction, and
it is *not* unique to France's statutory carve-out: a Tunisian carpooling operator (SPLIT)
already uses the identical cost-itemization defense with no Tunisian statute requiring it,
purely as prudent self-regulation. VAYA's Terms & Conditions adopt the same structure —
Article 2 (intermediary status) and Article 4 (cost-sharing cap) are deliberately the most
elevated, most explicit clauses in the document, because in Tunisia specifically, unlike in
France or the UK, there is no statutory safe harbor to fall back on if this framing is ever
challenged. Article 4's cap is not just a legal formality: it is the same bounded pricing
formula `packages/domain/src/pricing` already enforces server-side (`docs/domain/pricing.md`)
— the contract says in words what the code already does.

Full benchmark research behind this drafting, including BlaBlaCar's Terms structure and the
underlying Tunisian statutes (Loi organique n°2004-63 on data protection + INPDP, Loi
n°2000-83 on e-commerce, Loi n°92-117 on consumer protection, Loi n°2004-33 on land
transport): see this session's research, summarized in the "Sources and research basis"
section below. `docs/product/benchmark.md` §2 and §4 already document BlaBlaCar's
cancellation and pricing model specifically and are cross-referenced from the CGU.

## Legal review status — read before publishing

**These documents were drafted by an AI coding session, informed by public web research,
not by a licensed Tunisian lawyer.** They are a genuine, substantive first draft — not
boilerplate, not a placeholder — but per this app's own "never claim fabricated success"
principle (`CLAUDE.md`), this status must not be glossed over:

- [ ] **Have a licensed Tunisian avocat review both documents before public launch**,
  specifically the "transport clandestin" classification risk (CGU Article 4/17) — this is
  actively enforced terrain (§2d of the research), not dormant law, and the correct framing
  materially affects VAYA's legal exposure.
- [ ] **Complete VAYA's INPDP declaration** for routine personal-data processing (Article 7
  of Loi 2004-63) and **INPDP authorization** for biometric/KYC data processing (driver
  selfie, license, insurance photo capture) before those flows go live in production —
  referenced as a live requirement in Privacy Policy §4.3, not yet filed as of this
  drafting.
- [ ] **Confirm whether any production infrastructure (hosting, file storage, SMS,
  push-notification, error-tracking providers) is hosted outside Tunisia**, and if so, file
  the separate INPDP cross-border-transfer authorization (Loi 2004-63 Arts. 47, 50-52)
  referenced in Privacy Policy §6 before that data starts flowing.
- [ ] **Fill in the bracketed placeholders** in both documents: the effective date, VAYA's
  registered legal entity name/form/RNE number/matricule fiscal/registered address (CGU
  Article 20, Privacy Policy §1), and the INPDP's current official contact details (Privacy
  Policy §13) — none of this information exists yet anywhere in this codebase, so it could
  not be filled in without inventing it.
- [ ] **Have the Arabic translation reviewed by a native legal-Arabic speaker** before
  relying on it for Arabic-speaking Members — the Arabic content in
  `packages/legal/src/{terms,privacy}.ts` was produced by the same drafting session as the
  French original, not independently translated by a professional legal translator.
- [ ] **Deploy `apps/website` to a real, permanently-reachable production domain**, then add
  that domain's `/legal/privacy` URL to both store listings' required Privacy Policy field.
  The pages themselves are done and build-verified (`pnpm --filter @vaya/website build`
  generates real static HTML for all four `/{fr,en}/legal/{terms,privacy}` routes) — this is
  purely the hosting/domain step, tracked in `LAUNCH_ACTIONS.md` #6 alongside the rest of
  the Oracle Cloud deployment work.

None of the above blocks shipping the *mechanism* (the in-app screens, the delete-account
flow) — it blocks treating the *content* as legally final. Track these as the natural
continuation of `LAUNCH_ACTIONS.md`'s existing §6/§7 items, which this work resolves the
engineering half of.

## Version history

| Version | Date | Change |
|---|---|---|
| 1.0 | [effective date TBD] | Initial draft — first real Terms & Conditions and Privacy Policy VAYA has ever had, replacing the unlinked disclaimer string on the sign-in screen. |

## Sources and research basis

BlaBlaCar structure/framing: BlaBlaCar's published Terms & Conditions (legal.blablacar.com),
the Garrigues/Lexology commentary on BlaBlaCar's "information society service provider"
classification (Madrid Provincial Appellate Court), BlaBlaCar's own cost-sharing framing
(blog.blablacar.fr). Tunisian legal framework: Loi organique n°2004-63 (INS.tn full text),
INPDP's published procedures for biometric-data declarations and cross-border-transfer
authorizations (idaraty.tn), the pending replacement bill (Projet de loi organique
n°095/2025, tracked via Business News and Regulations.AI as of February 2026), Loi n°2004-33
on land transport and its "transport clandestin" reading (Business News, Mosaïque FM,
Univers News, Leaders.com.tn — cross-referenced independent sources), Loi n°2000-83 on
e-commerce, Loi n°92-117 on consumer protection, and the French Code des transports Art.
L3132-1 (cited only as an international-practice reference point VAYA voluntarily adopts,
never as applicable law). This research was gathered via web search summaries — primary-source
full text could not be fetched directly in the drafting session's sandboxed environment for
several of these sources, which is part of why the licensed-counsel review above remains a
real, unclosed action item rather than a formality.
