# Foldcraft: Consumer World

A designathon prototype for **“Rethinking Consumption: Designing for Responsible Choices.”**

Foldcraft gives each person a small, persistent voxel island built from their real products. Zones mirror where things are
actually kept (freezer, fridge, pantry, counter). Product-specific guidance then turns into concrete next steps: store it
as the label says, use it before it's forgotten, give its packaging a next life, and check what you already have before buying
more. The island visibly recovers as you complete those actions.

This repository holds the **consumer side only**. The producer platform (which would publish product records and QR codes) is
represented by a local sample catalogue behind a `ProductSource` interface.

## Quick start

Requires Node.js 20.19+ or 22.12+.

```bash
npm install          # install dependencies
npm run dev          # start the dev server → http://localhost:5173
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build → http://localhost:4173
```

Other commands:

```bash
npm test             # unit tests for the domain rules (Vitest)
npm run typecheck    # TypeScript only
npm run lint         # ESLint
npm run dev:host     # dev server reachable from other devices on your network
```

## Suggested demo script (≈3 minutes)

1. **Onboarding:** three short cards, then **Enter demo world** (seeds 9 sample products).
2. **Explore:** drag to orbit, scroll or pinch to zoom, and use the zone dock (Frostlands = Freezer, Cold Grove = Refrigerator,
   Sunlit Plains = Pantry, Homestead = Counter & arrivals, Circularity Workshop = Reuse & sort). The **grid icon** toggles an
   accessible list view.
3. **Mismatch:** the Whole Milk is recorded on the *counter*, but its label says *refrigerate*. It carries an amber badge, and a dashed
   golden arc leads to a ghost in the Cold Grove. The Storage Coach (top left) explains why. Press **Moved it to
   refrigerator**: the item glides across the island and the world grows (Dormant → Stirring).
4. **Opened changes the rule:** the Tomato Ketchup is fine in the pantry unopened, but it has been opened, so its after-opening
   instruction (“refrigerate”) now applies.
5. **Circularity:** the Tomato Passata is used up and waits in the Workshop. Open the Circularity Coach and record
   **Reuse** (glass bottle) and **Recycle** (steel lid). The lifecycle is complete, and the meadow greens and flowers appear.
6. **Add a product:** **Add product** has four routes: *Scan* (real camera), *QR image* (decode a screenshot), *Samples* or *Manual*.
   Open **⋯ → Demo QR codes** for scannable codes, including one deliberately unsupported code. Review the details, then
   choose where the item really is. The label's suggestion is shown but never pre-selected.
7. **Before you buy:** type “milk”. Foldcraft lists similar *recorded* items and asks, neutrally, whether you'll use what you
   have. Choosing to use what you have counts as a responsible action. “I still need it” is respected without judgement.
8. **Reload:** everything persists. Use **⋯ → Reset demo world** to repeat the demo.

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

Producer-supplied data (`ProductRecord`) is kept separate from user state (`ConsumerItem`, `LifecycleEvent`). Tasks, storage
status and world vitality are **derived** rather than stored. To connect a real backend, implement `ProductSource`
(`resolveQr`, `get`, `list`) against the producer API. The world and UI don't change.

## Stack

React 19 · TypeScript · Vite 8 · three.js via @react-three/fiber 9 and @react-three/drei 10 · Tailwind CSS 4 · zustand ·
motion · lucide-react · jsQR · qrcode · Vitest. All 3D content is generated geometry. No external models or textures are loaded.

## Known limitations

- Camera scanning needs a secure context: `localhost` works, but a phone on your LAN needs HTTPS. Use the *QR image* tab or
  a tunnel with HTTPS when demoing on a phone.
- In **dev mode only**, React StrictMode makes drei's `<Html>` labels log “Attempted to synchronously unmount a root…” to the console.
  The production build (`npm run preview`) is clean.
- The three.js/R3F bundle is ~320 kB gzipped. It is lazy-loaded after the UI shell.
- Similarity matching in *Before you buy* is keyword/category based and can miss or over-match items.
