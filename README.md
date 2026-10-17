# Foldcraft: Consumer World

A designathon prototype for **“Rethinking Consumption: Designing for Responsible Choices.”**

Foldcraft gives each person a small, persistent voxel island built from their real products. Zones mirror where things are
actually kept (freezer, fridge, pantry, counter). Product-specific guidance then turns into concrete next steps: store it
as the label says, use it before it's forgotten, give its packaging a next life, and check what you already have before buying
more. The island visibly recovers as you complete those actions.

This repository holds all three parts: the scroll-driven landing page (`/`), the consumer world (`/world`) and the **Producer
Studio** (`/studio`), where a producer writes a brief, iterates a parametric package, runs simplified tests and publishes a product
record with a QR code. There is no backend: published records live in this browser's storage, and the QR code also carries a
compact copy of the record so another device can import it. A sample catalogue sits behind the same `ProductSource` interface.

**QR links** point at the origin the app is served from (`<origin>/p/<id>…`). A phone's own camera opens that link, and the app
forwards it to `/world?scan=…`. Codes printed by earlier builds (`foldcraft.app/p/…`) are still read by the in-app scanner.

## Quick start

Requires Node.js 20.19+ or 22.12+.

```bash
npm install          # install dependencies
npm run dev          # start the dev server → http://localhost:5173 (landing) and /world (consumer app)
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build → http://localhost:4173
```

**Routes:** `/` is the scroll-driven landing page; `/world` is the consumer app. Both are client-side routes, so a static host
needs an SPA rewrite (all paths → `index.html`). Vite's dev and preview servers already do this.

Other commands:

```bash
npm test             # unit tests for the domain rules (Vitest)
npm run e2e          # build, then first-time-user scenarios in real Chrome (playwright-core; set CHROME if not installed in the usual place)
npm run typecheck    # TypeScript only
npm run lint         # ESLint
npm run dev:host     # dev server reachable from other devices on your network
```

## Suggested demo script (≈3 minutes)

0. **Landing (`/`):** scroll to descend: through the cloud sea, over the mountain pass and plains, past the cliff edge into
   the cut-away strata, a cave where the FoldCraft parcel unfolds into a planter, the lava gallery, and down the waterfall
   to the island, which blooms as you arrive. **Enter Your World** opens `/world`. Scroll back up to reverse the journey.
1. **Onboarding:** one welcome card, then **Start with sample products** (seeds 9 sample products, each marked “Sample”).
   A small **Getting started** card ticks off three steps as you do them (open a product, do its next step, return to
   the world). **Help** brings it back.
2. **Explore:** the bottom bar has the three main actions: **My items** (search and filter everything you've recorded),
   **Add product** and **Before you buy**. In the world, drag to orbit, scroll or pinch to zoom, and use the zone chips
   (Freezer = Frostlands, Refrigerator = Cold Grove, Pantry = Sunlit Plains, Counter & arrivals = Homestead, Reuse & sort =
   Circularity Workshop). **Menu → List only** hides the 3D world.
3. **Mismatch:** the Whole Milk is recorded on the *counter*, but its label says *refrigerate*. It carries an amber badge, and a dashed
   golden arc leads to a ghost in the Cold Grove. Open it from **My items** (or tap it): the panel's **Next step** explains why. Press **I’ve moved it to the
   refrigerator**: the item glides across the island and the world grows (Dormant → Stirring).
4. **Opened changes the rule:** the Tomato Ketchup is fine in the pantry unopened, but it has been opened, so its after-opening
   instruction (“refrigerate”) now applies.
5. **Circularity:** the Tomato Passata is used up and waits in the Workshop. Open **To do** (Packaging group) and record
   **Reuse** (glass bottle) and **Recycle** (steel lid). Every action shows a confirmation with **Undo**. The lifecycle is complete, and the meadow greens and flowers appear.
6. **Add a product:** **Add product** has four routes: *Scan* (real camera), *QR image* (decode a screenshot), *Sample products* or *Type it in*.
   Open **Menu → Demo QR codes** for scannable codes, including one deliberately unsupported code. Review the details, then
   choose where the item really is. The label's suggestion is shown but never pre-selected.
7. **Before you buy:** type “milk”. Foldcraft lists similar *recorded* items and asks, neutrally, whether you'll use what you
   have. Choosing to use what you have counts as a responsible action. “I still need it” is respected without judgement.
8. **Reload:** everything persists. Use **Menu → Reset demo world** to repeat the demo.

## What is real vs. demonstration

| Works for real | Demonstration only |
|---|---|
| QR decoding from the camera and from uploaded images (jsQR), with permission-denied, no-camera and insecure-context fallbacks | Product records are fictional samples (clearly labelled *Sample data*) standing in for a producer API |
| Resolving Foldcraft QR payloads to records, with an honest “couldn't find this product” path for anything else | Arbitrary retail barcodes and QR codes are **not** resolved |
| Manual entry of any product; missing fields stay *unknown* | Recycling guidance comes from the record, not from local council rules |
| Recorded vs. recommended storage, opened-state rules, date-check reminders with snooze/dismiss | No accounts, sync, backend or push notifications |
| Storage and Circularity Coaches, lifecycle actions, per-component packaging outcomes | World vitality is illustrative feedback, not a measured environmental impact |
| Before-you-buy check against recorded items | |
| Persistence in `localStorage` (versioned key `foldcraft:world`, sanitised on load), reset demo | |
| Desktop and mobile layouts, list view (also the no-WebGL fallback), keyboard focus states, reduced motion | |

**Honesty rules built into the logic:**
- Items are only placed where the user says. Recommended storage is never treated as actual storage.
- No temperature, spoilage or safety inference. Dates are explicitly “a prompt to check”, and date types (use-by vs best-before) keep their meaning.
- Missing storage or packaging data is shown as unknown (“check the label”), never guessed.
- Progress is earned only for meaningful actions: correcting storage, using things up, handling packaging, and reconsidering a
  purchase. Adding, scanning or buying earns nothing, and discarding unused food earns nothing either.

## Architecture

```
src/
  domain/            Pure, tested logic. No React.
    types.ts           ProductRecord (producer) · ConsumerItem (user) · LifecycleEvent · Task
    storage.ts         zones, recommendation vs recorded location, mismatch rules
    tasks.ts           derived Storage/Circularity coach tasks + reminders
    circularity.ts     packaging components, end-of-life routes, unknown handling
    progression.ts     world vitality derived from the event log
    beforeYouBuy.ts    similarity matching against recorded items
    qr.ts · manual.ts · dates.ts
  data/catalogue.ts    sample product records (relative dates)
  services/
    productSource.ts   ProductSource interface + LocalCatalogueSource (swap for a producer API)
    store.ts           zustand store: actions, events, toasts, demo seed
    persistence.ts     versioned persistence, migration, validation, safe storage
    qrDecode.ts        camera / image QR decoding helpers
  world/             React Three Fiber scene (lazy-loaded)
    terrainData.ts     deterministic procedural floating island
    Terrain.tsx        instanced voxel terrain with procedural seam/grain shader
    propData.ts        trees, ice spires, vault, cellar, pantry shed, workshop, counter…
    Props.tsx          instanced props, windmill, waterwheel, pond and stream
    Products.tsx       product models, selection, badges, mismatch ghosts and arcs
    Effects.tsx        snow, pollen, clouds, completion bursts
    CameraRig.tsx      orbit controls + zone/item fly-to
  ui/                Interface (panels, coaches, add flow, onboarding, list view…)
```

Consumer capabilities, journeys and their step counts: [`docs/consumer-journeys.md`](docs/consumer-journeys.md).

Simulation Lab models, equations, units and the map from every displayed result to its calculation: [`docs/simulation-models.md`](docs/simulation-models.md).

Producer-supplied data (`ProductRecord`) is kept separate from user state (`ConsumerItem`, `LifecycleEvent`). Tasks, storage
status and world vitality are **derived** rather than stored. To connect a real backend, implement `ProductSource`
(`resolveQr`, `get`, `list`) against the producer API. The world and UI don't change.

### Landing page (`src/landing/`)

```
LandingPage.tsx     page shell: native scrolling track, fixed world, copy layer, gauge, footer, WebGL/crash fallback
content.ts          the seven stages: copy, scroll ranges, text windows, themes
journey.ts          one rAF loop: scroll → damped progress → CSS vars / stage index (no per-frame React renders)
timeline.ts         pure functions of progress: camera spline keyframes, atmosphere keyframes, island bloom
scene/worldgen.ts   deterministic continent: surface, cut face (strata, caves, lava gallery), underside, props, clouds
scene/*.tsx         instanced rendering (chunked, frustum-culled, windowed by journey), sky, lights, water, parcel
```

The final scene reuses the consumer island's own `Terrain` and `Props`; scroll drives `fx.vitality`, which `WorldCanvas`
resets from saved progress when `/world` mounts. Query flags for testing: `?webgl=0` (fallback), `?tier=low|high`, `?debug`
(exposes renderer stats). Reduced motion swaps the travelling camera for a composed still per stage.

## Stack

React 19 · TypeScript · Vite 8 · three.js via @react-three/fiber 9 and @react-three/drei 10 · Tailwind CSS 4 · zustand ·
motion · lucide-react · jsQR · qrcode · Vitest. All 3D content is generated geometry. No external models or textures are loaded.

## Known limitations

- Camera scanning needs a secure context: `localhost` works, but a phone on your LAN needs HTTPS. Use the *QR image* tab or
  a tunnel with HTTPS when demoing on a phone.
- In **dev mode only**, React StrictMode makes drei's `<Html>` labels log “Attempted to synchronously unmount a root…” to the console.
  The production build (`npm run preview`) is clean.
- The three.js/R3F bundle is ~320 kB gzipped. It is lazy-loaded after the UI shell and shared by the landing page and `/world`.
- Leaving `/world` with the browser Back button reloads the landing page (drei's `<Html>` labels can't be unmounted in place).
- Similarity matching in *Before you buy* is keyword/category based and can miss or over-match items.
