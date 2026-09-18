# VAYA Marketing Site — Asset Pipeline Decision (Phase 3A)

Status: **Phase 3A design document. Not implemented. No code in this repo changes as a
result of this file.** Builds directly on `docs/marketing/technical-feasibility.md`'s
hybrid-architecture recommendation and `docs/marketing/visual-bible.md`'s asset
inventory — this document decides *how* each asset in that inventory actually gets
produced, with free/open-source tooling preferred wherever it's realistic.

## 0. Environment reality check (done before recommending anything)

Checked directly on the machine this session runs on, because a pipeline
recommendation that assumes tooling nobody has installed isn't a decision, it's a
guess:

| Item | Finding |
|---|---|
| Blender | **Not installed.** No PATH entry, no `Program Files\Blender Foundation`. |
| GPU | Intel(R) HD Graphics 620, integrated, 1 GB shared VRAM. No discrete/CUDA/OptiX GPU. |
| RAM | 16 GB |
| Free disk | ~21 GB |
| `winget` | **Available** — Blender and ffmpeg can be installed with one command each. |
| `ffmpeg` | Not installed. |
| `python` | 3.13.6 installed (useful for scripting Blender's `bpy` headless once Blender exists, and for image-format conversion tooling). |
| MakeHuman, GIMP, Krita, Inkscape, Unity, Unreal | None installed. |
| Any image/video-generation tool available to me as an agent | **None.** This toolset has no image or video generation capability at all. |

Two consequences that shape every recommendation below:
1. **Nothing in this document assumes a tool exists that isn't actually here.** Where
   a tool is required, it's named explicitly as a setup step, not silently assumed.
2. **This machine's GPU cannot realistically do production-quality 3D rendering.** An
   integrated 2016-era Intel chip with no dedicated VRAM will run Blender's EEVEE
   viewport at reduced quality and will render Cycles (Blender's path-tracer, the
   usual route to true photoreal lighting) extremely slowly — potentially minutes per
   frame even at modest settings. This is a hardware gap, separate from the software
   being free or not, and it means **production-quality rendering should not happen on
   this machine** even once Blender is installed. See §4.

---

## 1. Per-asset pipeline decision

For each asset named in the brief, plus the medium classification the brief explicitly
asked for (true 3D / rendered image sequence / environment plate / HTML-CSS overlay /
existing VAYA procedural 3D).

### VAYA car (exterior)

- **Medium:** True 3D asset, then split by shot: rendered live by the **existing
  procedural system** for the wide/establishing/pull-back shots (S1.1, S1.2, S8.2, S9.1
  — where the car is small-in-frame and the current abstract style already reads well),
  and rendered to an **image sequence** for the close shots where the transition/arrival
  detail matters (S2.1, S8.1).
- **Cheapest/free pipeline:** Model in **Blender** (free, open-source) as a generic,
  unbranded compact sedan/hatchback — box-modeling from primitives is a realistic,
  well-documented Blender workflow and avoids any licensing question a real
  manufacturer's model would raise (also correct per the Visual Bible's "no branded
  vehicle" call). Before modeling from scratch, check **Sketchfab's CC0-licensed model
  category** and **Poly Haven** for an existing free, commercial-use-cleared generic car
  base mesh — reusing and reskinning (repainting to the Visual Bible's neutral palette)
  a decent free base can save real modeling time; quality/topology varies, so this needs
  a quick evaluation pass, not a blind download-and-use.
- **Why not fully photoreal-from-scratch here:** Car paint/reflection shading *can*
  look convincing with free tools (Blender's Principled BSDF handles metallic/clearcoat
  paint well) — this is the most achievable "true photoreal on free tools" asset in the
  whole inventory, unlike the characters below.

### VAYA car (interior / dashboard)

- **Medium:** **Environment plate**, not live 3D. The interior is essentially a static
  set across S3.1 and S4.1 (small camera drift only) — cheaper and more reliable to
  render a small number of fixed/near-fixed camera angles as background plates than to
  keep it as an interactive 3D asset the browser has to render.
- **Cheapest/free pipeline:** Blender box-modeled interior (dashboard, seats, door
  trim, phone mount prop) + free PBR materials from **Poly Haven** (fabric, leather,
  brushed plastic — CC0, no attribution even required) for realistic-without-custom-texturing
  shading.

### Phone mount + phone (dashboard and Ahmed's)

- **Medium:** The physical phone/mount **prop** is part of the interior/pickup-point
  plate (modeled and rendered once, in-frame). The **screen content** is always an
  **HTML/CSS overlay**, per the brief's own explicit instruction — never baked into the
  render.
- **Cheapest/free pipeline:** A simple, generic phone model in Blender (a rounded box
  with a dark screen area) — no need for a licensed/branded phone model; the real
  detail lives in the HTML overlay on top.

### Aysha, Ahmed, existing female passenger

- **Medium:** **Rendered image sequence** for all three — this is squarely the
  "harder, isolated" material flagged in the storyboard, and the one place this audit
  is most honest about the free-tooling/photoreal tension (see below).
- **Cheapest/free pipeline:**
  1. **MakeHuman** (free, open-source, `makehumancommunity.org`) for the base mesh —
     age/build/facial sliders get you a reasonable, customizable human base fast,
     without any modeling-from-scratch skill required.
  2. Export to **Blender** (MHX2 or FBX) for everything downstream: clothing, hair,
     posing, lighting, rendering.
  3. **Rigging/posing:** Blender's built-in **Rigify** (free, no install) for a
     production rig, or **Mixamo** (`mixamo.com` — free with an Adobe account, no cost,
     web-based) for fast auto-rigging plus a library of free motion-capture animations
     (walking, sitting, idle, head-turn) that can be retargeted to the MakeHuman mesh —
     genuinely useful for the small, specific poses this storyboard needs (Aysha's
     hands-on-wheel idle, Ahmed's phone-check, the boarding action).
  4. **Clothing:** MakeHuman's limited built-in clothing library, supplemented with
     free CC0 clothing assets from Sketchfab where available, or simple cloth-simulated
     garments modeled directly in Blender (more control, more time).
  5. **Hair:** Blender's particle hair system (free, built-in, skill-intensive) or a
     free hair-card asset pack — the single most fragile step for consistency across
     renders (see Risk 1 in the feasibility doc) and the step most worth "lock it once,
     reuse the exact same hair asset everywhere" discipline.
  6. **Skin/shading:** Blender's Principled BSDF with subsurface scattering, textured
     with either a free CC0 skin-texture set (a handful exist but are limited in
     variety/quality compared to paid libraries) or hand-painted/photo-projected
     texturing.
- **The honest tension, stated plainly:** steps 1–4 are genuinely, fully achievable
  with $0 in licensing cost and produce a solid *stylized-realism* result. Step 5–6
  (hair, skin) are where free tooling and true *photoreal* quality are in real tension
  — the gap between "MakeHuman + Blender defaults" and "a face that reads as a specific,
  real-feeling person" is a skilled digital-human art discipline, not a tool-selection
  problem, and no amount of free licensing closes that gap by itself. **Recommendation:
  target the Visual Bible's own "warm/soft-edged, not hyper-real" brand register (§4 of
  the Visual Bible already states this preference) rather than literal photoreal
  fidelity** — this is both more achievable on a 100%-free pipeline and more consistent
  with VAYA's actual stated brand character than chasing an uncanny-valley-risking
  hyper-real look would be. If true photoreal is a hard requirement regardless, that is
  a real scope/budget decision (likely needing paid character asset packs or a skilled
  freelance 3D character artist) that should be made explicitly, not discovered late.

### Highway

- **Medium:** **Existing VAYA procedural 3D** for the wide/establishing shots (S1.1,
  S1.2) — this is the strongest "reuse what's real" case in the whole inventory; the
  live site's `Road`/`Environment` components already render a convincing enough
  abstract highway for a shot where the car, not the road surface, is the subject.
  A supplementary **environment plate** (Blender + Poly Haven HDRI/textures) is only
  worth producing if S2.1's window-reflection detail needs more specificity than the
  procedural scene can reasonably provide — worth prototyping the procedural-only
  version first before committing to a second, plate-based highway asset.
- **Cheapest/free pipeline:** No new tooling for the procedural option (already
  shipped). For the plate option: Blender + Poly Haven (CC0 HDRIs/textures) + simple
  road/tree/terrain geometry.

### Pickup location (urban corner)

- **Medium:** **Environment plate.** This location is reused identically across three
  shots (S6.1, S7.1, S8.1) — exactly the case where technical-feasibility.md's "layered
  static background + one moving subject" efficiency point applies: build and render
  this location once (a small number of fixed camera angles, not a fully walkable set),
  and composite the character renders over/into it rather than re-rendering the whole
  environment per character shot.
- **Cheapest/free pipeline:** Blender box-modeled street scene (facades, a shopfront/
  café awning, street furniture, utility lines per the Visual Bible's "real texture"
  guidance) + Poly Haven materials/HDRIs. Deliberately scoped tight — 2–3 camera angles
  to match the storyboard's actual shots, not an open-world environment.

---

## 2. Explicit medium classification (per the brief's own categories)

| Asset | True 3D | Rendered image sequence | Environment plate | HTML/CSS overlay | Existing VAYA procedural 3D |
|---|---|---|---|---|---|
| VAYA car — exterior, wide/pull-back shots | | | | | ✅ |
| VAYA car — exterior, close shots (S2.1, S8.1) | ✅ (asset) | ✅ (delivery) | | | |
| VAYA car — interior/dashboard | ✅ (asset) | | ✅ (delivery) | | |
| Phone mount + phone hardware | ✅ (asset, in-frame prop) | | (part of plate) | | |
| Phone **screen content** (notifications) | | | | ✅ | |
| Aysha | ✅ (asset) | ✅ (delivery) | | | |
| Ahmed | ✅ (asset) | ✅ (delivery) | | | |
| Existing female passenger | ✅ (asset) | ✅ (delivery) | | | |
| Highway (wide shots) | | | | | ✅ |
| Highway (optional detail plate) | ✅ (asset) | | ✅ (delivery) | | |
| Pickup location (urban corner) | ✅ (asset) | | ✅ (delivery) | | |
| Route-line / pin effect | | | | | ✅ (already exists) |
| Map-altitude Tunisia geography (Act 9) | | | | | ✅ (extends existing skyline) |
| Light-flare/motion-blur transition (S2.1) | | (compositing technique, not a standalone asset) | | | |

Reading the table: **"true 3D" and "rendered image sequence/plate" are not
alternatives — they're two stages of the same pipeline** for every character and
close-up car/environment asset. The only assets that skip 3D modeling entirely are the
HTML overlays (pure code) and the wide/establishing shots (the existing procedural
system, already code, already shipped). This confirms the brief's own instinct: "not
everything must be fully 3D [live, in-browser]" — nearly everything *starts* as 3D (for
full lighting/camera control) but is *delivered* to the browser as a flat rendered
asset, with only the abstract bookend shots staying interactive 3D at runtime.

---

## 3. Full free/open-source tool list

| Tool | Purpose | Cost | Install |
|---|---|---|---|
| Blender | Modeling, rigging, lighting, rendering, compositing — the backbone of the whole pipeline | Free, open-source (GPL) | Not installed on this machine — see §4 |
| MakeHuman | Base human character mesh generation | Free, open-source | Not installed — see §4 |
| Mixamo | Auto-rigging + free motion-capture animation library | Free (Adobe account, no paid tier needed) | Web-based, no install |
| Poly Haven | CC0 HDRIs, PBR textures, some models | Free, no attribution required | Web-based, download as needed |
| Sketchfab (CC0 filter) | Supplementary free 3D models (car base mesh candidates, clothing/prop assets) | Free (CC0-filtered items only) | Web-based |
| ffmpeg | Frame-sequence ↔ video conversion, format conversion | Free, open-source | Not installed — `winget install Gyan.FFmpeg` |
| GIMP or Krita | Texture touch-ups, compositing fixes | Free, open-source | Not installed, not required for the initial pipeline |
| AVIF/WebP encoders (e.g. via Python/Pillow, or dedicated `avifenc`/`cwebp` CLIs) | Final web-delivery image compression, per `technical-feasibility.md`'s format targets | Free, open-source | Installable via `pip`/`winget` once needed |

**Nothing in this pipeline requires a paid license.** The one honest caveat, restated
from §1: free *licensing* does not by itself guarantee true photoreal *character*
quality — that gap is closed by art skill/time, not by a different tool choice.

---

## 4. What actually needs to happen before Phase 3B can produce real assets

This machine has none of the above installed and an integrated GPU unsuited to
production rendering. Concretely, in order:

1. **Install Blender.** Either:
   - `winget install --id BlenderFoundation.Blender -e` (fastest path on this
     Windows machine — `winget` is confirmed available), or
   - Download directly from `https://www.blender.org/download/` (official project
     site) and run the installer manually.
2. **Install MakeHuman** from `http://www.makehumancommunity.org/` (no winget package
   confirmed — direct download from the official site).
3. **Install ffmpeg**: `winget install Gyan.FFmpeg`.
4. **Plan for rendering hardware separately from this machine.** Even with Blender
   installed, this machine's integrated GPU should be used for **layout/blocking work
   and EEVEE preview only** (see `technical-feasibility.md`'s realism-level guidance —
   EEVEE, Blender's real-time-ish rasterizer, is dramatically faster than Cycles'
   path-tracer on weak hardware and can still reach a good "premium, not hyper-real"
   result, which also happens to match the Visual Bible's stated brand register). Final
   higher-fidelity renders, if the team decides true photoreal is required, will need
   either a machine with a real discrete GPU or a render-farm/cloud-GPU service — a
   real infrastructure cost this audit is not going to understate by calling it "free."
5. **A named person to own the character art.** MakeHuman + Blender + Mixamo gets a
   long way toward a working character pipeline mechanically, but the actual
   quality/consistency bar the storyboard needs (Risk 1 in the feasibility doc) depends
   on someone with real character-art skill driving that pipeline — this is a
   people/time gap as much as a tooling gap.

**None of the above is installed in this session's environment right now, so Phase 3B
cannot produce real rendered character/car/environment assets in this session.** See
the Phase 3 report for exactly what was produced instead and what remains blocked on
the steps above.
