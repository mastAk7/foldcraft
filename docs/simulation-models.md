# Simulation Lab: models, equations and what each result means

The Producer Studio's Simulation Lab compares packaging designs under identical, disclosed assumptions.
It is **not** a validated or certified test, a finite-element analysis, or a prediction of real damage.
This document maps every displayed number to the calculation that produces it.

Code: `src/studio/domain/sims.ts` (models), `units.ts` (units), `runs.ts` (run identity),
`src/studio/lab/topple.ts` (post-drop rest pose), `src/studio/lab/scenes.tsx` (animation).

## Units and coordinates

- **Model maths is SI:** m, s, kg, N, m/s², J, Pa. Briefs and geometry are stored in mm and g.
- **Conversion happens once** at the top of each `run*` function (`mmToM`, `gToKg`), and back only when results are built (`mToMm`, `toG`).
- **Traces are SI.** The UI converts them for the timeline.
- **One scene transform:** scene units are decimetres, `SCENE_PER_M = 10`, the same as `S = 0.01` scene units per mm used for the package geometry. Package, contents and trajectories share it.
- **Motion inside a pack is never magnified.** The only exaggeration is the optional, labelled "×4 deck motion" in the vibration scene. The whole pack moves with the deck, and readouts stay true. It is off by default.
- **Time scaling:** drop playback runs at 60% in free fall, easing smoothly to 6% around contact. Vibration plays at 50%. Time scaling changes playback speed only, never positions.

## Drop and impact (`integrateDrop`, `runDrop`)

**System.** Two lumped masses on one vertical axis:
- the package `M` = pack mass plus all units except one, treated as moving with the pack;
- one tracked unit `m`.

The package is held in the test orientation: bottom, side, or the fixed corner pose `ORIENT.corner`.

**Phases.**
1. Free fall from rest.
2. First contact: compressive-only spring–dashpot between package and floor.
3. The unit compresses its support (produce stiffness, in series with a pad or cell wall).
4. Rebound: the unit is stopped by the opposite boundary (lid or wall), or leaves an open tray.
5. Repeated decaying contacts.
6. **Rest:** both bodies stay below 2 mm/s on the floor for 30 ms, capped at 2 s.

**Equations.**
- Free fall: `v = √(2gh)`, `E₀ = (M + m)·g·h`.
- Contact force: `F = max(0, k·δ + c·δ̇)` for penetration δ > 0, with `c = 2ζ√(k·m_eff)`. The floor and boundaries cannot pull.
- Rebound restitution of such a contact, which separates when the force reaches 0 (Schwager & Pöschel 2007):
  - `e(ζ) = −e^{−ζ t_s}(cos ωt_s − (ζ/ω) sin ωt_s)`
  - `ω = √(1 − ζ²)`, `ωt_s = π − atan2(2ζω, ω² − ζ²)`
  - At ζ = 0.35, e ≈ 0.40 (the textbook `exp(−ζπ/√(1−ζ²))` = 0.31 assumes the contact can pull). The test suite checks the solver against this within 2%.
- Integrator: semi-implicit (symplectic) Euler with a fixed step `dt = clamp(0.02/ω_max, 1 µs, 10 µs)`, so ω·dt ≤ 0.02, far inside the stability limit of 2. The dampers only remove energy; the tests assert that total mechanical energy never rises.

**Rebound boundary (`impactGap`).**
- Along the impact direction `u`, the unit can travel `2 × side clearance` to the opposite wall on each package axis, or the headspace to a lid. Along a slanted axis, the first boundary reached wins (gap / |uᵢ|).
- An open-top bottom drop is unbounded. A unit escapes only if it rises more than its depth below the rim, `inner.h − (layers − 1)·unit.h`.

**Settle to a face (`topple.ts`).**
- After the one-axis trace comes to rest, a rigid uniform box rotates under gravity:
  - about the contact point (single contact, axis of the gravity torque);
  - or about a support edge;
  - with `θ'' = τ/I_pivot`, `I_pivot = aᵀ·I_cm·a + d²` (box inertia plus the parallel-axis term).
- Each new floor contact is perfectly inelastic. Rotation ends when ≥ 3 contacts surround the centre of mass.
- Bottom and side poses are already stable, so they do not move. A corner drop lands on the face its centre of mass selects; a tall box can end on its side.
- The contents are held fixed during this step.

| Displayed | Calculation | Method label |
|---|---|---|
| Impact speed | √(2gh) | calculated |
| Energy at release | (M + m)·g·h | calculated |
| Peak package deceleration | max floor force ÷ M ÷ g, first impact | motion model (estimate: scales with assumed stiffness) |
| Peak deceleration on a unit | max support force on the unit ÷ m ÷ g, first impact | motion model (estimate) |
| Assumed sensitivity level | `produce.ts` typical value × fragility factor | simplified estimate (assumption) |
| Max package deformation | max floor-contact compression, first impact | motion model |
| Unit compression at contact | max unit–support compression | motion model |
| Unit rebound | max movement away from the impact face (capped at the rim depth once it escapes) | motion model |
| Package rebound ratio | rebound speed ÷ impact speed at first separation | motion model |
| Energy absorbed by rest | E₀ − mechanical energy at rest | motion model |
| Time to come to rest | t(rest) − t(first contact) | motion model |
| Risk | unit peak ÷ sensitivity: < 0.8 low, < 1.2 moderate, else high; plus rule flags | rule |

**Scene.**
- Height, the unit's relative motion and the floor-contact compression are drawn at true scale. The compression is shown as compression of the pack along the impact axis, with the contact point kept on the floor. The pack never sinks into the floor.
- The floor ring shows unit deceleration ÷ assumed sensitivity, in the same fixed bands as the risk. It is not normalised per run.

## Stack compression (`runStack`)

**System.** Static, force-controlled loading. Identical packs stand on each other; each carries the weight of every pack above it. Nothing deforms in the model or in the scene, which shows placement only.

**Equations.**
- Load on pack i: `Fᵢ = (n − 1 − i)·m_pack·g`.
- Load-bearing wall area: `A = Z·t`.
  - `Z` = outer perimeter, plus the interior walls of compartment trays.
  - `t` = wall thickness.
- Mean wall stress: `σ = F/A`.
- Edge-crush stress of the wall material: `σ_ECT = ECT/t` (from the assumed `ectPerMm`).
- McKee form: `BCT = 5.87·ECT·√(t·Z)·form` (ECT N/mm, t and Z in mm, BCT N).
- Buckling factor: `BCT/(Z·ECT)`, always < 1. This is why a box fails long before its walls crush.
- Derating: climate (chilled or frozen) × humidity ≥ 85% × misalignment `max(0.4, 1 − 1.5·offset/footprint)`.
- Margin: `derated capacity ÷ (load × transport safety factor)`.
- Static tipping:
  - Alternate packs are offset along the narrower outer side.
  - The centre of mass of the packs above pack i is the mean of their offsets.
  - It must stay within half that side.

**Geometry.** Overhang, support half-width and the McKee perimeter all use `pkg.outer`.

| Displayed | Calculation | Method |
|---|---|---|
| Gross mass per pack | pack + units × unit weight | calculated |
| Load on bottom pack | (n − 1)·m·g | calculated |
| Mean wall stress | F / (Z·t) | calculated |
| Wall stress ÷ edge-crush stress | σ / (ECT/t) | estimate (assumed ECT) |
| Estimated capacity | McKee | estimate (McKee is for corrugated boxes; comparative only for board, pulp and PET) |
| Derated capacity, margin | as above | estimate |
| Overhang, centre-of-mass offset | geometry | calculated |

**Not computed.** Static deflection and strain. They need a measured load–deflection (BCT) curve of the real pack, conditioned at the storage humidity. The material table has no modulus, and one is not invented.

## Transport vibration (`baseMotion`, `integrateVibration`, `runVibration`)

**Excitation.** The deck moves in a defined way:
- `x(t) = −Σ Aᵢ sin(2πfᵢt + φᵢ)` with a fixed seed, so `a(t) = Σ (2πfᵢ)²·Aᵢ·sin(…)`. Peak acceleration of a tone is `(2πf)²·A`.
- Bumps are haversine displacement pulses, `A_b/2·(1 − cos 2πτ/T)` with T = 40 ms. The deck rises and returns (no net velocity), and the peak acceleration equals the profile's bump level.
- Lateral motion along the package length is 50% of vertical, with its own phases.

**System.** One unit in its cell, in the deck frame (pseudo-force −m·a_deck).
- Vertical: compressive spring–dashpot floor, and a lid when the design has one.
- Lateral: walls at ±play/2 with `play = 2 × side clearance along the pack length`, taken from the arrangement geometry.
- Coulomb friction μ = 0.4 is applied as an impulse each step: if the trial velocity change fits within μ·N·dt/m the unit **sticks exactly**, otherwise it slides with kinetic friction.
- The unit starts at static equilibrium, so zero excitation gives zero motion.
- Fixed step `dt = min(100 µs, 0.05/ω_max)`.

**Checked behaviour** (tests):
- No lift-off while the deck's downward acceleration stays below g, and lift-off above it.
- At equal amplitude, a higher frequency lifts the unit (`(2πf)²A`).
- No sliding below μ·g, and sliding above it, bounded by the walls.

| Displayed | Calculation | Method |
|---|---|---|
| Peak deck acceleration | Σ(2πf)²A + bump peak (upper bound) | calculated |
| Sliding per second | total slide distance ÷ duration | motion model |
| Wall/lid contacts per second | new contacts ÷ duration | motion model |
| Peak contact force ÷ unit weight | max contact force ÷ m·g (resting = 1) | motion model |
| Time airborne | share of time without floor contact | motion model |
| Free play | 2 × side clearance | calculated |
| Risk | max(sliding × loose-fill heuristic 2.5 ÷ assumed abrasion level, peak ÷ ½ assumed sensitivity) | rule: a comparison band, **not** a damage probability |

## Material and produce data

`materials.ts` and `produce.ts` hold **assumed typical values**, rounded from published ranges. They are not supplier data and not measurements:
- ECT per mm of wall;
- floor-contact stiffness;
- the "recoverable" deformation limit;
- chilled and frozen strength factors;
- produce stiffness, sensitivity and abrasion levels.

The pad stiffness (4 kN/m) and cell-wall stiffness (25 kN/m) in `sims.ts` are assumptions too, as are the contact damping ratios (0.35 pack, 0.5 produce, 0.3 vibration) and μ = 0.4. Every result card lists the values used.

## Run identity and replay (`runs.ts`)

- **What a run key covers:** the design version, the test settings, `SIM_MODEL_VERSION`, and **only the context fields that test's model reads** (`RELEVANT`). For example, transport and cold chain change only stack (and Break-my-design) keys.
- **What a run stores:** the context it was computed with. The lab replays a run with *its own* geometry, contents and trace, never the current design's. A stale replay is labelled.
- **Persisted records** keep an input snapshot, so the report can say which input changed.
- **Report and passport labelling:**
  - The Report separates recorded runs from estimates recomputed when it is opened.
  - Passport summaries are labelled as estimates computed at publish time, with the model version and conditions.

## Architecture: why no physics engine

The behaviour that matters is one-axis impact through compliant contacts, a small rigid-body topple, and closed-form strength checks. A rigid-body engine such as Rapier would add roughly 1–2 MB of WASM, make exact reproducibility harder to guarantee, and still could not predict cushioning, buckling or bruising, because those need measured material curves. The lab instead uses:
- small deterministic fixed-step solvers, run once per test, with no dependence on frame rate;
- a pure topple solver;
- analytical equations.

Playback samples the stored trajectory by model time. Each frame advances at most 50 ms of wall time, so a slow frame slows playback rather than skipping samples.

## Limitations and data needed for higher fidelity

- **Drop:**
  - One axis: no rotation in flight and no second impacts on other faces.
  - Linear contacts with assumed k and ζ.
  - One representative unit.
  - Needed: measured cushion curves (peak g vs static stress per drop height), coefficient-of-restitution tests, and produce bruise thresholds (g, energy).
- **Stack:**
  - McKee outside its corrugated domain, and no creep.
  - Needed: BCT tests of the real pack, load–deflection curves, and humidity conditioning (e.g. TAPPI T 804, ISO 12048).
- **Vibration:**
  - Deterministic sine-plus-bump profile, not a random PSD.
  - No pallet or vehicle resonance, no package rotation, one unit.
  - Needed: ASTM D4169 / ISTA random-vibration PSDs, transmissibility of the pallet and stack, and measured friction.
