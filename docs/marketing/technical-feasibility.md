# VAYA Marketing Site — Technical Feasibility Audit

Status: **Phase 2.5 design document. Not implemented. No code in this repo changes as
a result of this file. Evidence-based against the actual `apps/website` codebase as of
this audit, not generic assumptions.**

## 1. What actually exists today (the baseline everything below is measured against)

Inspected directly (`apps/website/`):

- **Framework:** Next.js 15.1.6 (App Router), React 19.1.0, TypeScript. `next dev
  --turbopack`. `output` is unset (defaults to a standard Node server build, not static
  export) — `pnpm --filter @vaya/website build` produces per-locale prerendered HTML
  (confirmed working, per `CLAUDE.md`'s "Terms & Conditions public URL" changelog
  entry) via `generateStaticParams`, not `next export`.
- **Rendering architecture:** Server Components by default; the entire cinematic
  `Journey` component tree is `'use client'`, and its Three.js subtree is loaded via
  `next/dynamic(..., { ssr: false })` — already correctly code-split out of the initial
  server-rendered payload.
- **Routing:** `/[locale]/...` App Router segments, `middleware.ts` for locale
  detection/redirect, two locales (`fr`, `en`) via `src/i18n/dictionaries.ts` (plain JSON
  dictionaries, no i18n framework dependency).
- **Existing animation libraries (already installed, already in `package.json`):**
  `gsap` ^3.12.5 (+ `ScrollTrigger`, already used), `framer-motion` ^11.15.0 (installed,
  not yet observed in use in the files read), `@react-three/fiber` ^9, `@react-three/drei`
  ^10, `@react-three/postprocessing` ^3, `postprocessing` ^6, `three` ^0.171.0.
- **CSS/Tailwind setup:** Tailwind 3.4.17, a small custom token extension
  (`tailwind.config.ts`) mirroring the app's real design tokens (§6 of the Visual
  Bible), no component library (no shadcn/etc.) — hand-rolled components throughout.
- **Asset pipeline:** **There is no `public/` directory in this app today.** Zero
  images, zero video, zero static binary assets. `next.config.mjs` sets
  `images: { unoptimized: true }` — the Next.js built-in image optimizer (sharp-based
  resize/format-negotiation/CDN caching) is explicitly disabled. Fonts are loaded via
  `next/font/google` (Fraunces, Plus Jakarta Sans), which self-hosts at build time —
  free, no runtime Google Fonts request, already optimal.
- **Deployment setup:** No Vercel/Netlify config, no Dockerfile for this app (unlike
  `apps/api`, which has one), not present in `.github/workflows/ci.yml` (that workflow
  only builds/tests `apps/api`/mobile/admin — the website has no CI gate at all today).
  `CLAUDE.md`'s own changelog notes an Oracle Cloud deployment was "in progress" with
  no production domain live yet as of the last recorded entry. **This means there is
  currently no confirmed CDN/edge-hosting target for whatever asset strategy is chosen
  — a real open dependency, not a detail to gloss over.**
- **Image/font handling:** As above — no image pipeline exists to inherit; whatever is
  built for the cinematic experience will be the site's *first* binary-asset pipeline,
  not an extension of an existing one.
- **Existing responsive behavior:** `Journey.tsx` already feature-detects
  `min-width: 900px` and swaps to a 2D SVG fallback below it, in addition to
  `prefers-reduced-motion` and WebGL support detection. This is a genuinely solid,
  already-proven pattern — any new approach must preserve it, not replace it.
- **Current performance:** Not independently benchmarked in this audit (no live
  deployment to measure against; `playwright`-based `scripts/shoot.mjs` exists for
  visual QA screenshots but isn't a performance harness). Structurally, though, the
  current page's total JS-beyond-framework footprint is small: no images at all, a
  lazy-loaded 3D chunk, hand-rolled CSS. This is a genuinely fast baseline — the risk
  section below is explicit that the redesign's biggest threat is *regressing* this,
  not merely "being fast enough."
- **Existing dependencies:** No video-processing tooling (`ffmpeg`, no video
  components), no image-sequence/canvas-scrub library, no CMS/headless-content layer,
  no analytics package observed in the files read.

**The single most important finding of this audit:** the current site's entire visual
identity is *procedural* (Three.js primitives, SVG, CSS) — it ships with zero asset
weight beyond fonts and JS. Any approach below that introduces rendered/photoreal
imagery is, by definition, this app's first real asset-budget problem. That is not a
reason to avoid it (the brief's ambition genuinely requires photoreal or near-photoreal
character work — see the Visual Bible), but it means there is no existing asset
pipeline, CDN, or optimization tooling to lean on. All of it would be new.

---

## 2. Approaches evaluated

### 2.1 Image-sequence + GSAP ScrollTrigger

The "Apple product page" technique: render N frames of a shot, draw the frame matching
current scroll progress to a `<canvas>`.

- **Visual quality potential:** High — this is how most real premium scroll-cinematic
  sites achieve photoreal quality, because each frame is a full offline render (Blender,
  or a generative pipeline), not a real-time constraint.
- **Scroll precision:** Excellent — frame-accurate, deterministic, trivially matched to
  `ScrollTrigger`'s `progress` (the exact mechanism `Journey.tsx` already uses for the
  3D scene via `progressRef`).
- **Performance:** Good if disciplined (canvas draw is cheap); risk is entirely in
  asset weight and decode cost, not runtime computation.
- **Mobile feasibility:** Good — no WebGL requirement at all, works everywhere `<canvas>`
  works (universal). This is a real advantage over the WebGL approach for a market
  (Tunisia, per `CLAUDE.md`'s own emphasis on realistic mobile/LAN conditions) where
  mid-tier Android devices and constrained bandwidth are the honest default, not the
  edge case.
- **Implementation complexity:** Low-to-medium — GSAP + canvas-draw is a well-documented,
  proven pattern; the harder work is asset *production* (rendering the frames), not the
  web implementation.
- **Asset size:** The real cost center — see Performance Budget (§3) for concrete
  numbers. This is the approach's central risk.
- **Browser compatibility:** Excellent (canvas is universal).
- **Development effort:** Low for the web layer; potentially large for asset production
  (character rigging/rendering) — effort shifts from engineering into art production.
- **Maintainability:** Good — a frame sequence is a static asset, easy to reason about,
  easy to swap/update per shot without touching other shots' code.
- **Hosting/bandwidth implications:** Meaningful — this is genuinely a bandwidth cost,
  not a free lunch, and this app has no CDN in place today (§1).
- **Can it realistically stay free?** Yes for tooling (Blender is free/open-source;
  GSAP's core + all plugins including `ScrollTrigger` became free for all users,
  commercial included, following GreenSock's 2025 acquisition by Webflow — **verify the
  exact current license terms before shipping**, since this audit's knowledge of that
  change should be confirmed against GSAP's current license page at implementation
  time, not taken on faith here). Hosting cost scales with asset size and traffic —
  free tiers (Cloudflare Pages, GitHub Pages/Releases as a stopgap) can absorb this at
  low-to-moderate traffic; it stops being free at scale, same as any bandwidth-heavy
  site.
- **Biggest technical failure mode:** Asset bloat silently creeping past the mobile
  budget because "a few more frames for smoothness" is an easy, cumulative, hard-to-notice
  mistake — see Risk #2.

### 2.2 Three.js/WebGL 3D scene + GSAP

Extend the *existing* system — real-time 3D geometry, GSAP-driven or `useFrame`-driven
camera, as already implemented.

- **Visual quality potential:** High for stylized/graphic work (already proven — the
  existing scene looks good for what it's attempting); genuinely difficult to reach true
  photoreal *character* quality in real-time WebGL without a AAA-game-level rigging/
  shading/lighting pipeline this team has no evidence of having. Real-time human skin/
  hair/cloth shading is one of the hardest unsolved-in-general problems in real-time
  graphics — this is not a skill-issue risk, it's closer to a genre limit.
- **Scroll precision:** Excellent — continuous, not frame-quantized (`CameraRig.tsx`
  already demonstrates buttery-smooth scroll-to-camera mapping).
- **Performance:** Variable — cheap for the current low-poly abstract scene; would get
  expensive fast if pushed toward photoreal character rendering (skinned mesh animation,
  high-poly geometry, PBR material complexity, shadow maps) — precisely the direction
  the brief's human-character shots need.
- **Mobile feasibility:** The existing code already assumes real-time 3D is
  *mobile-inappropriate* — its own feature-detection explicitly disables the 3D path
  below 900px width, regardless of WebGL support. That's a strong, already-made,
  evidence-based product decision this audit endorses continuing, not revisiting.
- **Implementation complexity:** Low to extend for more of the *existing* abstract
  style (car geometry tweaks, more environment detail, more camera shots); high to push
  toward photoreal characters (character rigging in Three.js/R3F, skeletal animation,
  facial rigging — a materially different engineering discipline than anything in this
  codebase today).
- **Asset size:** Low for procedural geometry (today's actual state — effectively
  zero); would grow significantly for imported character models/textures/animations
  (glTF models with PBR textures, skinning data).
- **Browser compatibility:** Good but not universal — WebGL2/WebGL1 support varies on
  older/budget devices, already why the existing 2D fallback exists.
- **Development effort:** Low to extend the abstract system; high to add
  photoreal-capable character rendering from scratch.
- **Maintainability:** Good for the existing procedural style (all code, no external
  asset files to manage); worse if real character assets are imported (asset versioning,
  rig maintenance, animation retargeting become new maintenance surfaces this repo has
  no tooling for).
- **Hosting/bandwidth:** Low if kept procedural (current state); moderate-to-high if
  photoreal glTF character assets are added.
- **Can it realistically stay free?** Yes — three.js/r3f/drei/postprocessing are all
  open-source (MIT-class licenses), no paid service involved.
- **Biggest technical failure mode:** Attempting photoreal human characters inside
  real-time WebGL and landing in the uncanny valley at a fraction of the polish a
  pre-rendered frame sequence would achieve for the same effort — the classic
  "real-time 3D character work is much harder than it looks" trap.

### 2.3 Blender-rendered assets + browser compositing

Offline-render every shot (or every character/environment element as a layered plate)
in Blender, composite in-browser via CSS/canvas layering rather than a full frame
sequence per shot.

- **Visual quality potential:** Highest achievable on this list for photoreal work —
  offline rendering has no real-time constraint, full path-tracing/Cycles quality is
  available, and Blender is free/open-source (directly satisfies the brief's "as close
  to 100% free/open-source as realistically possible" requirement for the *tooling*,
  though render *time*/compute is still a real cost in labor-hours or render-farm
  spend, not a license fee).
- **Scroll precision:** Depends on execution — if the "browser compositing" is really
  "render key layers, then interpolate/cross-dissolve between a sparser set of frames in
  the browser," precision is good but not frame-perfect; if it collapses to "render a
  full frame sequence," this is really approach 2.1 with a specific production pipeline
  named.
- **Performance:** Good if the compositing stays simple (layered images + CSS
  transforms/opacity); risk grows if the "compositing" tries to do too much live
  (parallax layers, live blend modes) on lower-end mobile GPUs.
- **Mobile feasibility:** Good, same reasoning as 2.1 (no WebGL dependency for the
  compositing itself, assuming plain image layers).
- **Implementation complexity:** Medium — more moving parts than a flat image sequence
  (layer management, z-ordering, possibly parallax math), but each individual piece is
  simple.
- **Asset size:** Similar order of magnitude to 2.1, potentially somewhat better if
  layering lets static background elements be reused across many "frames" instead of
  baked into every one (e.g., a static street background layer shared across the whole
  of S6–S8, with only the character layer changing frame-to-frame) — a genuine
  efficiency advantage over a flat full-frame sequence for shots with a mostly-static
  background and one moving subject, which describes several of this storyboard's
  character shots well.
- **Browser compatibility:** Excellent (images + CSS, universal).
- **Development effort:** Medium-high — this is the most *art-directable* approach
  (Blender gives full creative/lighting control) but also the most labor-intensive to
  execute well; realistically the same character-consistency risk as 2.1 since it's
  still "render this character/scene N times," just with layer separation as an
  optimization on top.
- **Maintainability:** Good — Blender project files are a real, versionable source of
  truth for every shot, better than an opaque generative-AI output would be for future
  edits.
- **Hosting/bandwidth:** Similar to 2.1, potentially better with the layering
  efficiency noted above.
- **Can it realistically stay free?** Yes for tooling (Blender). Labor/render-time is a
  real cost but not a *licensing* cost — this is the approach most aligned with the
  brief's "free/open-source" ask if "free" is read as "no recurring SaaS/license fees,"
  which is the reading this audit assumes is intended (a literal zero-labor-cost bar
  isn't achievable for any approach that produces custom cinematic character work).
- **Biggest technical failure mode:** Scope/time creep — Blender character work
  (rigging, shading, lighting, rendering at commercial quality) is a real skilled
  discipline; underestimating the hours here is the single most common way ambitious
  in-house 3D-commercial projects blow their schedule.

### 2.4 Video-based scroll experience

Pre-render each shot (or the whole sequence) as an actual video file, scroll-scrub via
`video.currentTime` seeking (or `requestVideoFrameCallback`) synced to `ScrollTrigger`.

- **Visual quality potential:** High — same rendering freedom as 2.1/2.3, plus H.264/
  AV1 temporal compression means a video file is typically **far smaller** than the
  equivalent raw frame sequence for the same visual content (this is video codecs'
  entire reason for existing) — a genuine, significant asset-size advantage over 2.1.
- **Scroll precision:** The weakest point of this approach. `video.currentTime` seeking
  is **not** guaranteed frame-accurate or low-latency across browsers — Safari/iOS in
  particular has well-documented seek-latency and keyframe-snapping quirks that make
  buttery-smooth scroll-scrub materially harder to achieve than with a canvas-drawn
  image sequence, where each draw is deterministic. This is a real, currently-observed
  cross-browser inconsistency in the video-scrub technique generally, not a
  browser-specific edge case to dismiss.
- **Performance:** Can be good once working, but tuning around seek latency
  (frequent forced keyframes for scrubbability, which partially erodes the compression
  advantage above) adds real complexity.
- **Mobile feasibility:** Mixed — video decode is hardware-accelerated and generally
  efficient, but the seek-precision problem above is often *worse* on mobile Safari
  specifically, which is a meaningful share of any real Tunisian mobile audience.
- **Implementation complexity:** Medium-high — getting reliable, jank-free scroll-sync
  video scrubbing working consistently across Chrome/Safari/Firefox/mobile is a known
  hard problem with a smaller body of proven, battle-tested open-source reference
  implementations than the image-sequence technique has.
- **Asset size:** Best-in-class if it works cleanly (codec compression advantage above)
  — this is video's real strength.
- **Browser compatibility:** Good for playback, inconsistent for precise scroll-scrub
  seeking specifically (as above).
- **Development effort:** Medium-high, concentrated in the scroll-sync reliability
  problem rather than the encoding pipeline (which is simple/free via `ffmpeg`).
- **Maintainability:** Good — a video file per shot is simple to manage/replace.
- **Hosting/bandwidth:** Best of the rendered-asset approaches, assuming keyframe
  density doesn't have to be pushed so high (for scrub responsiveness) that it erodes
  the compression advantage significantly.
- **Can it realistically stay free?** Yes for tooling (`ffmpeg` is free/open-source);
  same hosting-cost caveat as the others.
- **Biggest technical failure mode:** Visible stutter/seek-lag during scroll on Safari/
  iOS specifically, undermining the exact "feels continuous" quality the whole brief is
  built around, on a browser share too large to treat as an edge case.

### 2.5 Hybrid approach — **recommended**

Combine 2.1/2.2 rather than picking one universal technique for all nine acts, because
the storyboard's own shots are not uniform in what they need:

- **Acts 1 (partial), 5, 8.2, 9** are environment/camera-driven, character-free, and
  already close to what the *existing* abstract-3D system does well — **keep and
  extend approach 2.2** (the current `Journey`/`JourneyScene`/`CameraRig`/`Road`/
  `Environment`/`Pin` system) for these. This is close to zero incremental asset-size
  cost, since it's the system that already ships with zero binary assets.
- **Acts 2 (transition), 3, 4, 6, 7, 8.1** are character-driven close/medium shots
  where real-time WebGL character quality is the weakest option on this list —
  **use approach 2.1 (image-sequence + GSAP)** for these, produced via Blender (2.3) as
  the actual production pipeline, since image-sequence is the most scroll-precise,
  most universally browser-compatible, and most mobile-friendly of the
  rendered-asset options, and the storyboard already isolates these shots as their own
  short, bounded segments (each roughly 6–14% of total scroll) rather than one giant
  continuous render — keeping each individual sequence's asset footprint bounded and
  independently optimizable.
- **The two phone-notification beats (S4.1, S7.1)** stay **real HTML/CSS overlays**
  (already effectively decided by the brief and already precedented by
  `AppUIMoments.tsx`) — zero additional asset cost, real localization, matches the
  existing site's own established pattern.
- **Video (2.4)** is not recommended as the primary mechanism given the Safari
  scroll-scrub risk specifically, but remains worth a cheap side-by-side comparison
  during the prototype phase (§5) for the two or three longest/most-continuous
  character shots, purely because of its real compression advantage — a decision to
  defer to prototype evidence, not to rule out here.

This is explicitly **not** "the most technically impressive option" (that would be
full photoreal WebGL, which this audit does not recommend) — it is the simplest
architecture that can plausibly deliver the brief's actual cinematic ambition without
regressing the site's currently-excellent lightweight/accessible baseline.

---

## 3. Performance budget

Concrete targets, chosen to keep the *initial* page experience close to the current
site's near-zero-asset baseline, with the expensive cinematic material loaded
progressively rather than all at once — mirroring the discipline `Journey.tsx` already
applies to the 3D chunk via `next/dynamic`.

| Budget | Target |
|---|---|
| Initial page load (critical path, pre-interaction) | ≤ 1.5 MB total transferred (HTML + critical CSS/JS + fonts), no cinematic image-sequence/video assets included |
| JavaScript — critical/non-lazy | ≤ 150 KB gzipped |
| JavaScript — 3D chunk (existing pattern, lazy-loaded, desktop/wide only) | ≤ 350 KB gzipped |
| Total cinematic rendered-asset weight — desktop | ≤ 20 MB across the full page, loaded progressively (never all at once — see below) |
| Total cinematic rendered-asset weight — mobile | ≤ 8 MB across the full page (mobile skips or substantially thins the character image-sequences; see §3.1) |
| Individual image-sequence frame — desktop | ≤ 60 KB (AVIF/WebP) |
| Individual image-sequence frame — mobile | ≤ 25 KB (AVIF/WebP, lower resolution tier) |
| Frame resolution — desktop | ~1600×900 (matches typical viewport, not 4K source — downsample from a higher-res Blender render) |
| Frame resolution — mobile | ~900×506 |
| Frames per character shot | 60–120 per shot (not 1:1 with scroll pixels — GSAP/canvas interpolation between sampled frames is standard practice and keeps count bounded; exact count tuned during prototyping against perceived smoothness) |
| Target FPS — scroll scrub | 60 fps desktop; ≥ 30 fps sustained on a mid-tier Android device (explicit mobile target, not "best effort") |
| Memory (decoded image cache) | Keep resident decoded-frame memory under ~150 MB on mobile via a windowed prefetch (only current + adjacent shot's frames decoded/held at once, older ones released) rather than holding every frame for the whole page in memory simultaneously |
| Mobile bandwidth assumption | Design for realistic Tunisian mobile conditions (3G/4G, not assumed 5G/Wi-Fi) — this is the same "don't assume LAN/ideal network" discipline `CLAUDE.md` already applies to the mobile app's own dev setup, extended to the marketing site's real-world audience |

### 3.1 Desktop vs. mobile strategy

- **Desktop (≥ 900px, WebGL-capable, no reduced-motion):** Full experience — existing
  abstract-3D bookends + full-resolution image-sequence character shots + HTML overlays.
- **Mobile / narrow viewport:** This audit recommends the *existing* site's own
  precedent be extended, not reinvented: mobile already gets a categorically simpler
  experience (`JourneyFallback2D`, an SVG path) rather than a scaled-down 3D scene.
  Applying the same philosophy here: mobile should get **lower-resolution,
  lower-frame-count image sequences for the character shots** (not the 3D bookends,
  which mobile already skips entirely) plus the same HTML overlays (cheap, already
  responsive). A literal 1:1 "same cinematic experience, just smaller" on mobile is
  the wrong target — a deliberately simpler-but-still-real mobile experience, matching
  the existing fallback philosophy, is more honest about real device/bandwidth
  constraints and safer against Risk #2/#3 below.
- **Reduced motion:** Every new asset type (image-sequence, any video) must respect
  `prefers-reduced-motion` exactly as the existing 3D/2D-fallback split already does —
  freeze on one representative static frame per shot plus real, static text content,
  never force autoplay/scroll-scrub motion on a user who has opted out.

### 3.2 Where to use which technique

- **AVIF primary, WebP fallback:** for every rendered image-sequence frame (AVIF's
  better compression is worth the added encode step; WebP as the safe fallback for the
  handful of older browsers without AVIF support).
- **Lazy/progressive loading:** load each act's image sequence only as the user
  approaches that act's scroll range (e.g., a small look-ahead window, not the whole
  page's assets on initial load) — this is the single biggest lever for keeping the
  *initial* load light despite a large *total* page asset budget.
- **Image sequences over video:** as the default technique per §2.5's reasoning
  (scroll-scrub precision), with video kept as a prototype-stage comparison specifically
  for the longest continuous character shots.
- **WebGL:** only for the already-existing abstract bookend shots (Acts 1/5/8.2/9),
  never for photoreal character rendering (per §2.2's realism-limit finding).
- **HTML/CSS overlays:** both phone-notification beats, always — never baked into a
  rendered frame, per the brief's own explicit instruction.
- **Reduced-motion fallback:** a static, real (not blank) frame + real text per shot,
  extending the existing `JourneyFallback2D` philosophy to the new shot types.
- **Mobile-specific assets:** a genuinely separate, lower-cost asset tier (not just
  a CSS-scaled version of the desktop assets) for the character image sequences, per
  §3.1.

---

## 4. Critical risk analysis

Ranked roughly by (severity × likelihood), most urgent first.

### Risk 1 — AI-generated or multi-source character inconsistency
- **Severity:** High (undermines the entire film's credibility — a face that subtly
  changes between shots reads as a glitch, not a stylistic choice).
- **Likelihood:** High, specifically *if* character shots are produced via
  frame-by-frame generative AI without a locked 3D/reference pipeline; Low if produced
  via a rigged 3D character asset (Blender) rendered consistently from one model.
- **How we'd detect it:** Direct visual QA — place candidate frames from different
  shots side-by-side and check hair/wardrobe/face-shape consistency; this is a cheap,
  fast check, not a sophisticated one.
- **Cheapest experiment to validate:** Generate/render a small (5–10 frame) test
  sequence of one character (Aysha, S3.1) using the candidate production method and
  check consistency *before* committing to a full-pipeline production run for all
  character shots.
- **Mitigation:** Prefer a rigged 3D character asset (approach 2.3's Blender pipeline)
  as the source of truth for every character render, rather than independent
  per-shot generative-AI outputs; if generative AI is used at all, restrict it to
  locked-reference/ControlNet-style consistency techniques with a fixed seed/reference
  image, never free generation per shot.

### Risk 2 — Total asset payload too large for real-world mobile bandwidth
- **Severity:** High (directly undermines the "genuinely production-ready, fast,
  responsive" requirement in the brief).
- **Likelihood:** Medium-High without deliberate budget discipline — this is the
  easiest constraint to blow past incrementally ("just a few more frames," "a bit
  higher resolution for quality") given this app currently has *zero* precedent/tooling
  for managing binary asset weight (§1).
- **How we'd detect it:** Real bundle/asset-size measurement against the §3 budget as
  a CI-enforced gate (this codebase already has a strong "add a CI check for the thing
  that bit us before" culture — see `CLAUDE.md`'s `verify-migrations` precedent —
  the same instinct applies here).
- **Cheapest experiment:** Measure the actual encoded size of one full character shot's
  frame sequence at the target resolution/frame-count *before* producing all shots, and
  compare against the §3 per-shot allocation.
- **Mitigation:** The §3 budget itself, enforced by lazy/progressive per-act loading and
  a genuinely separate lower-cost mobile asset tier (§3.1), not a shared one.

### Risk 3 — Poor mobile performance / scroll jank from combining heavy asset decode with scroll-driven redraw
- **Severity:** High (directly breaks the core "feels continuous" experience).
- **Likelihood:** Medium — GSAP ScrollTrigger + canvas draw is a proven pattern, but
  naive implementations (decoding on the main thread, not releasing old frames, decode
  stalls during fast scroll) are a common failure mode.
- **How we'd detect it:** Chrome DevTools Performance profiling + Core Web Vitals INP
  measurement during scroll, on an actual mid-tier Android device (not just desktop
  Chrome's mobile emulation, which understates the problem).
- **Cheapest experiment:** Build the single-shot prototype (§5) and profile it on one
  real mid-tier device before committing to the full nine-act build.
- **Mitigation:** `createImageBitmap` for decode (off the main render path where
  possible), windowed frame prefetch/release (§3, memory row), avoid layout-thrashing
  DOM reads/writes inside the scroll handler (the existing `CameraRig.tsx`/`Journey.tsx`
  code already shows this discipline — extend it, don't abandon it).

### Risk 4 — Camera continuity / the "enter the car" transition specifically
- **Severity:** Medium (a creative/craft risk, not a fatal technical one — see
  mitigation).
- **Likelihood:** High that a *literal*, continuous, ungimmicked "camera travels
  through the glass" shot is unachievable at reasonable budget/quality — this is a
  known-hard problem even in big-budget productions, not a sign of insufficient effort.
- **How we'd detect it:** Storyboard/animatic review before committing to final-quality
  production of this specific shot.
- **Cheapest experiment:** Prototype S2.1 specifically (it's already called out as the
  single highest-priority shot to prototype in the storyboard) using the disguised
  motion-blur/light-flare whip technique described there, and evaluate whether it reads
  as continuous.
- **Mitigation:** Already designed into the storyboard — a disguised cut (motion blur +
  light flare) rather than a literal geometry pass-through, which is standard real-world
  automotive-commercial practice for exactly this shot type.

### Risk 5 — WebGL/device compatibility regressing the existing bookend shots
- **Severity:** Medium.
- **Likelihood:** Low — the existing code already has a proven, working
  feature-detection + 2D-fallback system; the main new risk is regressing it while
  extending `cameraShots`/`CHAPTER_COUNT`, not a new compatibility problem.
- **How we'd detect it:** The existing fallback path already provides a safety net;
  regression would show up as the 3D path silently failing on a device that should
  have gotten the 2D fallback, which is a normal QA-matrix check (a handful of real
  low/mid-tier devices, not an exhaustive device lab).
- **Cheapest experiment:** Re-run the existing feature-detection logic unmodified
  against the extended chapter count/shot list before adding new 3D content.
- **Mitigation:** Keep the existing detection logic (`prefers-reduced-motion`,
  `min-width: 900px`, WebGL context probe) as the single gate for *all* 3D content,
  old and new, rather than adding a second, parallel gating mechanism for the new shots.

### Risk 6 — Browser memory usage from held image-sequence frames
- **Severity:** Medium (can cause tab crashes/slowdowns on lower-RAM mobile devices,
  a real and embarrassing failure mode for a "premium" experience).
- **Likelihood:** Medium if all frames for all nine acts are decoded and held
  simultaneously (naive implementation); Low with the windowed prefetch/release
  strategy in §3.
- **How we'd detect it:** Chrome DevTools memory profiling during a full top-to-bottom
  scroll, watching for monotonically increasing decoded-image memory that never drops.
- **Cheapest experiment:** Build the prototype with the release strategy from day one
  and verify memory is bounded (plateaus, doesn't climb) during a full scroll-through.
- **Mitigation:** Windowed frame management (§3, memory row) — never hold more than the
  current + adjacent act's frames decoded at once.

### Risk 7 — Long development/production time relative to the ambition
- **Severity:** High for schedule/cost predictability specifically.
- **Likelihood:** High without phased scoping — character rigging, consistent
  rendering across ~9 shots, environment art, and web integration is a genuinely large
  body of work for a team whose only prior marketing-site asset was zero binary files.
- **How we'd detect it:** This is a planning risk, not something instrumented after
  the fact — the mitigation *is* the detection mechanism.
- **Cheapest experiment:** The §5 single-shot prototype, explicitly scoped to answer
  "how long did the hardest representative slice actually take" before committing to
  the full nine-act schedule.
- **Mitigation:** Phase the rollout — the character-free bookend shots (Acts 1 partial,
  5, 8.2, 9) can ship first, cheaply, as an extension of the *existing* working system,
  independent of whether/when the harder character-shot pipeline is ready; they are not
  blocked on each other.

### Risk 8 — Deployment/bandwidth cost creep with no hosting target confirmed
- **Severity:** Medium.
- **Likelihood:** Medium — real, since §1 confirms no CDN/hosting target is locked in
  yet for this app specifically.
- **How we'd detect it:** Simply: there is currently no answer to "where do these
  assets get served from with acceptable cache/CDN behavior," which is itself the
  finding.
- **Cheapest experiment:** Confirm the actual hosting plan (Oracle Cloud, per
  `CLAUDE.md`'s in-progress note, or a dedicated static-asset CDN) before asset
  production begins, not after.
- **Mitigation:** A static-asset CDN with long-lived immutable caching
  (content-hashed filenames) for the cinematic assets specifically, independent of
  wherever the Next.js app itself ends up hosted — this decouples "where does the app
  run" from "where do the big files live," which is good practice regardless of the
  final hosting answer.

### Risk 9 — Inability to reproduce the desired cinematic transitions at the web layer
- **Severity:** Medium (a "the prototype doesn't feel as good as the storyboard reads"
  risk).
- **Likelihood:** Medium — this is genuinely the open question the whole audit is
  building toward; the honest answer is "unknown until prototyped," not "solved."
- **How we'd detect it:** Direct, subjective evaluation of the prototype (§5) against
  its own stated success criteria.
- **Cheapest experiment:** The §5 prototype itself.
- **Mitigation:** N/A beyond the prototype process — this risk is exactly why Phase 2.5
  ends in a prototype recommendation rather than a final architecture commitment.

### Risk 10 — Cultural/representation risk in character depiction
- **Severity:** High (brand/reputation risk, distinct from a technical failure mode).
- **Likelihood:** Medium without deliberate review — already flagged explicitly in the
  Visual Bible (§2) as an open decision, not resolved by default choices made there.
- **How we'd detect it:** Local/cultural stakeholder review of character wardrobe and
  appearance references before any final asset production, mirroring the review
  discipline `docs/legal/README.md` already applies to the Arabic legal translation.
- **Cheapest experiment:** Share the Visual Bible's character section with someone with
  real local cultural context before locking wardrobe/appearance references, well
  before any rendering work begins.
- **Mitigation:** Build both wardrobe-default variants noted in the Visual Bible (with
  and without headscarf) into the reference sheet from the start rather than treating
  it as a late change.

---

## 5. Prototype recommendation

**The question to answer:** "Can we make the user feel like the camera is continuously
travelling through the VAYA story as they scroll, smoothly and at high visual quality?"
— and, given §1's baseline, specifically: can that be done *without* regressing this
site's currently excellent lightweight, accessible, zero-binary-asset posture into
something slow or janky on a real mid-tier mobile device.

### What to prototype

A single, real, end-to-end vertical slice: **Acts 1 → 2 → 3 (S1.1 through S3.1)** —
hero highway (existing abstract-3D system, extended with 1–2 new `cameraShots`
entries), the "enter the car" transition (the single highest-risk shot, per Risk 4),
and one character-close-up shot (Aysha, interior) using the recommended hybrid
technique (image-sequence + GSAP, per §2.5), plus the S4.1 phone-notification HTML
overlay for good measure since it's cheap and validates the compositing approach too.

This slice deliberately includes: the existing system (to prove the extension path
works), the hardest transition (Risk 4), the hardest asset class (a real character
shot, to surface Risk 1/Risk 2 early), and the easiest new piece (the HTML overlay, to
confirm it composites correctly over a rendered image layer). It deliberately
**excludes** Ahmed, the pickup location, and Acts 5–9 — those are lower-risk
repetitions of techniques this slice already validates, not new unknowns.

### What can be a placeholder

- Aysha's specific final character design/rig can be a rough stand-in (even the
  existing abstract-3D car's aesthetic language extended to a simple stylized human
  silhouette, if a full character asset isn't ready in time) — the prototype is
  validating the *mechanism* (hybrid handoff, scroll-scrub smoothness, transition
  disguise, overlay compositing), not the final art.
- The highway/city environment can reuse/extend the existing procedural `Environment`
  largely as-is rather than commissioning a new rendered plate.
- Notification copy can stay the storyboard's illustrative placeholder text.

### Success criteria

- The handoff from the existing abstract-3D system to the image-sequence character
  shot (S2.1's transition) shows **no visible seam or pop** — the motion-blur/light-flare
  disguise genuinely reads as continuous, not as two different systems trading off.
- **≥ 30 fps sustained** during scroll-scrub on one real mid-tier Android device (not
  emulated) throughout the prototyped slice.
- **Total added payload for this slice stays under ~3 MB** (a deliberately tight
  sub-budget of §3's full-page numbers, appropriate for one shot's worth of frames).
- The phone-notification HTML overlay stays crisp, correctly positioned over the
  underlying render, and correctly localized (fr/en) at both a desktop and a mobile
  viewport.
- The `prefers-reduced-motion` fallback for this slice still produces a coherent,
  non-broken static experience (extends `JourneyFallback2D`'s existing philosophy,
  doesn't abandon it for the new shot types).

### What would cause a change of architecture

- If the abstract-3D → image-sequence handoff **cannot** be made to look continuous
  even with the disguised-transition technique — reconsider whether Act 2 needs a
  harder cut with a strong enough sound/visual beat to justify it (a legitimate,
  common real-world fallback in actual commercials), rather than forcing a fragile
  effect.
- If frame decode/draw causes sustained jank below ~24 fps on a real mid-tier Android
  device despite the optimizations in §3/§4 (Risk 3) — reconsider video (2.4) for that
  specific shot type despite its own risks, or reduce visual ambition for the mobile
  tier specifically (consistent with §3.1's "deliberately simpler, not just smaller"
  mobile philosophy) rather than the desktop tier.
- If reaching genuinely cinematic quality for even this one shot pushes payload
  meaningfully past the ~3 MB slice budget — extrapolate honestly (a 9-act film at that
  rate would blow the full-page budget several times over) and revisit either the
  frame-count/resolution assumptions in §3 or the number of full-fidelity character
  shots the final storyboard commits to, before producing the remaining eight acts at
  the same settings.

**This prototype is not to be built as part of this Phase 2.5 audit.** It is the
explicit, recommended input to a future Phase 3 decision, described here so that
whoever picks this up next has a concrete, bounded, falsifiable first step rather than
a blank "go build the whole thing" mandate.
