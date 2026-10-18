# Consumer world: capabilities, journeys and step counts

How a person gets things done in `/world`, before and after the simplification on branch `consumer-ux`.
Requirements are PRD §8 (consumer world), §9 (FR-05 to FR-16), §10.1–10.3 and §13.2 (information hierarchy).
No consumer capability was added or removed. What changed is how each one is reached, confirmed and undone.

Regression check: `npm run e2e` runs the first-time-user scenarios (A–K) and the walk-mode scenarios (L–Q, see the end of this page) in real Chrome.

## Capability map

| Capability (PRD) | State / data | Entry point before | Entry point now | Actions | Completion feedback now |
|---|---|---|---|---|---|
| Personal world with labelled zones (§8.1, FR-06) | `items[].actual`, `zoneForItem` | 3D world; zone dock (6 equal buttons) | 3D world; secondary zone chips (plain label first: "Freezer 1"), caption "Freezer · 1 item" with **Whole world** | Look at a zone | Camera moves; item names appear in the focused zone |
| Find a product | `items` | Find the object in 3D, or discover the unlabelled grid icon for a list without search | **My items** (bottom bar): search by name, brand, place or state; filters; grouped by recorded location | Search, filter, open | "Showing n of N"; empty and no-match states |
| Add via QR / fallback (§8.2, FR-04/05) | `ProductSource`, `addItem(record, actual, via, {recordVersion, origin})` | Add product → tabs Scan / QR image / Samples / Manual | Same flow; tabs "Sample products" and "Type it in" | Scan, upload, pick sample, type | Toast "… added" with **Undo**; panel opens on the new item |
| Actual vs recommended location (§8.2, FR-07) | `actual`, `currentRecommendation` | Product panel, middle of ten sections | Product panel **Storage** (right after Next step): "Where you recorded it" / "Label recommends" | Confirm / change location | Toast, with Undo |
| Product detail + next action (§8.3, FR-08) | Derived tasks (`visibleTasks`) | Product panel; next action buried | Product panel order: identity → **Next step** → Storage → Dates → Record what you did → Packaging → folded "Record details & history" | The step's own buttons | Toast + panel state changes |
| Storage coach (§8.4, FR-09) | `deriveItemTasks` (storage coach) | Bell icon → "Storage" tab (also held date checks) | **To do** (labelled, with count) → group "Storage & dates"; top suggestion card | Move, record location, check label, snooze | Toast, with Undo |
| Reuse / recycling coach (§8.5, FR-10) | `packagingComponents`, `item.packaging` | Bell → "Circularity" tab | **To do** → group "Packaging"; or the item's Next step | Record a route per part | Toast per part; "Lifecycle complete" at the end, with Undo |
| Reminders: snooze, dismiss, complete (§8.6, FR-15) | `item.tasks[key]` | Task card buttons; no feedback | Same buttons, now with feedback | Snooze, dismiss (not for use-by or expiry), complete | Toast with **Undo**; "Show again" in the item's record details |
| Lifecycle events (§8.6) | `events`, `item.status` | Product panel "Use" | Product panel "Record what you did": I opened it / Used it up / Threw it away unused | | Toast with Undo |
| Before you buy (§8.7, FR-16) | `findSimilar` | Bottom bar | Bottom bar; opening a match gives **Back to Before you buy** with the query kept | Use what I have / still need it | Inline message; activity entry |
| Progression (§8.8, FR-11) | `vitality(events)` | World name button, History icon, … menu (three ways in) | World name button ("· Progress"), or Menu → Progress & activity | | Growth toast; world visuals |
| Demo QR codes, About, reset | | … menu | **Menu** (labelled) | Reset keeps its confirmation | Toast |
| List / no-3D alternative (§10.1) | `listView` | Unlabelled grid icon | Menu → "List only (hide 3D world)"; automatic when WebGL is missing or crashes; uses the same list as My items | | |
| Save failure (§10.3) | `saveError` | **Silent**: writes were swallowed | Banner "Your changes aren’t being saved" with the cause, **Try saving again** and **Download a copy** | | Banner clears when a save succeeds |

## Core journeys: minimum steps (clicks or taps, excluding typing)

| # | Journey | Before | Now | Notes |
|---|---|---|---|---|
| 1 | Enter the world for the first time | 3 (Next, Next, Enter demo world). The one-click "Skip intro" was easy to miss | **1** (Start with sample products / Start empty) | A three-step guide card then teaches by doing |
| 2 | Find a named product and open its details | Unbounded in 3D; or 2 via an unlabelled icon (no search, scan five sections) | **2** (My items → row), with search | The world still works: tap an object |
| 3 | Read storage, date and packaging guidance for it | Open + scroll past up to 6 sections | Open; Next step and Storage are first | |
| 4 | Fix a storage mismatch | 1 (top suggestion) / 2 (To do → button) | 1 / 2 (unchanged) | Also the first card in the product panel |
| 5 | Record packaging after using something up | 3 (bell → Circularity tab → route) | **2** (To do → route) | Or the item's Next step |
| 6 | Add a product from a sample or QR image | 6 | 6 (unchanged) | Review and location confirmation are PRD requirements (§8.2), so they stay |
| 7 | First-timer opening a product QR with the phone camera | 3 (onboarding) + 3 (review, location, add) | **1** + 3 | Now recorded as `qr_link`, not `studio_link` |
| 8 | Undo a mistaken "Used it up", discard, packaging route, removal, snooze or dismissal | Impossible | **1** (Undo on the toast) | Toasts with Undo stay 9 s and pause while hovered or focused |
| 9 | Bring back a dismissed reminder later | Impossible | 3 (open item → Record details → Show again) | |
| 10 | Check a planned purchase, inspect a match, go back | 3 + retype the query | **1** to go back, query kept | |
| 11 | Return to the world from any panel | 1 (× or Esc) | 1 (× or Esc); **Back** returns to the panel you came from | Focus returns to the button that opened the panel |

## Safeguards kept on purpose

- **Reset demo world**: two-step confirmation in the Menu.
- **Remove entry**: confirmation, now with Undo too.
- **"Used up" from a date reminder**: still needs an explicit second confirmation (`NEEDS_CONFIRM`). A date is a reason to check, not proof the item was used.
- **Use-by and expiry reminders**: can be snoozed, never dismissed while the item is in use. This is enforced in the UI (`canDismiss`) and in the store (`dismissTask` refuses those keys).
- **Samples**: can only be loaded into an empty world, and every sample item is marked "Sample" in lists and "Sample data" in details.

## The world and Walk mode (branch `consumer-world`)

### Why the world felt small, and what changed

The island was 42 blocks across, and it was only ever seen from one high orbit camera that showed all of it at once. Each
storage zone ran straight to the island edge, so there was nothing beyond them. Apart from a windmill and a waterwheel
there were no landmarks, and the edge fell off into empty sky. Scaling the map up would not have fixed any of that, so
instead:

- **Same core, a bit more room.** The five storage zones keep their places around the plaza, 3 blocks further apart.
  Every zone is still a short walk from the plaza, and every task still works from **My items** without travelling.
- **An outer ring of landscapes** (the island is now about 70 blocks across). Each one is chosen for its link to the product journey:

  | Landscape | Where | Why it's there |
  |---|---|---|
  | Highland + **Lookout** | behind the Freezer (NW) | Continues the cold Frostlands; a terraced hill with a cairn and a view over the whole world |
  | Birch forest + **Forest clearing** | behind the Refrigerator (NE) | The PRD's "forest = shelter" metaphor; the river starts here |
  | **Orchard** and fields | behind the Pantry (SW) | Where pantry food comes from |
  | River, pond and **Wetland** | east and south-east | One water system: river → Cold Grove pond, and the workshop stream (which refills as the world recovers) drains into reed beds that regrow with progress |
  | Meadow hills | south | The approach to the plaza |

- **Wayfinding.** A ring path joins the landscapes, with spurs out to each landmark. Signposts stand where the spurs
  leave the ring, and lanterns light the paths (they appear at the top stage, as before). Each landmark has a text label,
  and a few distant floating islets give a sense of depth.
- **Nothing new to collect, fight or craft.** World changes stay tied to recorded actions, through the existing vitality system.

### Walk mode (optional)

**Overview | Walk** sits at the start of the zone row. Overview is the existing orbit view and stays the default.
Switching either way keeps everything: the open item, the open panel, the focused zone and all saved data.

| Do this | Laptop (keyboard + touchpad) | Touch screen |
|---|---|---|
| Walk | **W A S D**, or **↑ ↓** | Hold the on-screen arrow pad |
| Turn | **← →** | Drag a finger across the world |
| Look around | Press and hold on the touchpad, then slide. A two-finger swipe also works. No mouse, wheel or right-click is needed | Drag |
| Open the highlighted item | **E**, or click (tap) it | Tap |
| Go to a zone | Zone chips or zone labels: a short glide takes you there | Same |
| Close a panel / leave | **Esc** closes the open panel first; the next **Esc** leaves walk mode. **Leave walk mode** is always visible | Leave walk mode button |

How it behaves:

- **First visit.** A controls card appears the first time you walk. **Controls** reopens it, and **Settings** sets
  look speed (slider) and walking speed (Slow / Normal / Brisk). These settings are saved per browser
  (`foldcraft:walk`), separate from your world.
- **Where you start.** If an item is open, you start in front of it. If a zone is focused, you start facing that zone.
  Otherwise you start on the south path, looking across the arrivals pad to the counter. A compass strip names the
  place straight ahead and shows the others as icons with distances.
- **Picking an item.** The highlighted item is the nearest one within about 6 blocks and 28° of where you look, so it
  needs no precise aiming. It gets a ring, its name, and a "Press E or click to open" prompt. Opening it uses the same
  product panel as everywhere else.
- **Clicks are never moves.** A press counts as looking only after it has travelled 5 px. Anything shorter is a click.
  No single pointer event can turn the view by more than 60 px' worth. Up/down look stops at ±65°.
- **Movement stops predictably.**
  - It stops at once when the window loses focus or the tab is hidden.
  - It pauses while any panel, sheet or item is open (a notice says so).
  - Keys are ignored while typing in a field, inside a panel or menu, or with Ctrl/Cmd/Alt held.
  - Arrow keys and swipes never scroll the page, and a pinch is ignored.
  - Nothing takes keyboard focus away from the rest of the interface.
- **Physics, without an engine.** The player is a circle (radius 0.35) on the terrain height grid, simulated at a
  fixed 120 Hz, so speed is the same at any frame rate.
  - Long frames are capped at 0.1 s, so there are no jumps after a tab switch.
  - Steps of one block are climbed automatically, so jumping is never needed. Anything taller is a wall.
  - The terrain generator guarantees that neighbouring walkable cells differ by at most one block, so nowhere can
    trap you.
  - Water, rock spires and the outermost ring of cells can't be walked on, so you can't fall off.
  - Buildings, trunks, posts and products have simple footprint colliders, kept separate from their visual boxes.
  - Starting and stopping are eased, and there is no head-bob or camera shake.
  - With reduced motion, transitions are instant.
- **Separation.** Walk state lives in its own store (`src/world/walk/walkState.ts`). Movement code never touches items,
  events or anything that is saved.

### Rendering cost

- **Terrain.** The terrain is now one merged, face-culled mesh per 16×16 chunk: tops, exposed sides and the underside
  only, with no hidden faces between columns. It used to be three full instanced boxes per column. Chunks have real
  bounds, so walk mode culls what's behind you.
- **Other draw calls.** Clouds are one instanced mesh instead of about 50 separate ones.
- **Shadows and fog.** The shadow area follows the view (tighter while walking), and walk mode adds fog in the sky's
  horizon colour.

Measured under software WebGL (SwiftShader, 1440×900; the only renderer available to the automated tests):

| Build | Overview | Walk |
|---|---|---|
| Before (42-block island) | 2.0 fps | n/a |
| After, before face culling (70-block island) | 0.6 fps | 0.2 fps |
| After (70-block island) | 3.9 fps | 4.2 fps |

These figures are only useful for comparing builds. A real GPU renders many times faster.

### How it's tested

- **Unit tests:** `npm test` → `src/world/walk/walk.test.ts`. They check that:
  - terrain is bounded and needs no jumps;
  - every zone, pad and landmark can be reached from the plaza;
  - a player can't pass through the freezer vault or a tree, and stays on the island and on the ground after
    20 s of walking at the edge in six directions;
  - 30 fps and 144 fps cover the same distance;
  - a long frame is capped, start and stop are eased, and look is bounded;
  - key scoping and release work.
- **Browser tests:** `npm run e2e`, scenarios L–Q. They run in real Chrome with emulated keyboard, mouse-drag and wheel
  input. They cover:
  - the controls card;
  - each key and look method;
  - blur stopping movement, typing not moving, and panels pausing;
  - zone travel, E and click opening an item, and recording an action;
  - the vault wall and island edge holding;
  - the Esc order;
  - switching views keeping the open item;
  - overview still working.

### Manual touchpad check (not automated)

The automated tests emulate input; they cannot use a physical touchpad. On a laptop with its built-in touchpad and no
mouse attached:

1. Choose **Walk**. The controls card appears; press **Got it**.
2. Hold **W** for two seconds: you walk forward smoothly and stop gently when you let go. Try **A**, **S**, **D**, **↑**,
   **↓**, **←** and **→**.
3. Press and hold on the touchpad (or tap-and-hold, if tap-to-click is on), then slide. The view turns smoothly in the
   direction of the slide, and up/down stops before looking straight up or down.
4. Swipe two fingers left/right and up/down. The view turns, and the page doesn't scroll or zoom. Pinch: nothing
   happens.
5. Walk up to an item until it's highlighted. A single tap or click opens it, and the view doesn't move. Close the
   panel with **Esc**.
6. While holding **W**, switch to another window (Alt+Tab), then come back. You are not still walking.
7. Open **My items**, type "wasd" in the search box: you don't move. **Esc** closes the panel; **Esc** again leaves walk
   mode and returns to the same overview you left.
8. **Settings**: move the look-speed slider and check that touchpad look gets faster or slower to match.

## Coach chats, the help rail and demo alerts

- **Coach chats.** **Storage Coach** and **Circularity Coach** sit directly under the world name (top left). Each opens
  a narrower panel on the left, just below those buttons (a bottom sheet on a phone), so the world, the help rail and
  any alerts on the right stay in view. Questions are preset buttons. Answers are built by fixed rules in
  `src/domain/coachChat.ts`. They use only the chosen product's record (label wording, dates, packaging parts and
  their listed routes) and what you've recorded (location, status). They are not a free-text AI. When the record lacks
  something, the answer says so ("Not in the record") and never invents a temperature, date or recycling route.
  Recycling answers always add the local-collection caveat. Opened from a product, the chat is about that product, and
  closing it returns to the product. Each coach keeps its own conversation until the demo world is reset.
- **Help rail.** The getting-started guide, the single coach suggestion, the walk controls card and demo alerts share
  one column on the far right. Beside an open side panel the column moves to the panel's left. Below about 1180 px
  there isn't room for both, so it steps aside until the panel closes. It stops above the bottom dock and scrolls if
  it's full. Toasts move left of it (and below the header) when they would otherwise overlap it. On a phone it spans
  the width under the header, as before.
- **Simulate demo warning.** For presentations. The **Simulate demo warning** button at the top right shows the milk
  and fruit warnings in one click, e.g. "Your milk on the kitchen counter is going off today, so use it up." (the
  location is where you recorded it). **Menu → Simulate demo alerts** picks milk or fruit alone, and is the way in on
  a phone. "Today" is the simulation: each alert also gives the item's real date from its record. It offers **View details**, **Ask Storage Coach** (opens on that item's dates)
  and, for fruit, **Packaging info**. Alerts are UI state only. They aren't saved, never change items, records or
  events, and don't count towards progress. Simulating again replaces the alert, and dismissing one leaves the other.
  If there's no milk or fruit in the world, the option says so instead of inventing one. The sample world now includes
  **Strawberries** (Fresh produce) for the fruit alert.
- **Tested by** `src/domain/coachChat.test.ts`, the "coach chats" and "simulated demo alerts" blocks in
  `src/services/consumer.test.ts`, and browser scenarios R (1280 and 1024 px) and S (390 px phone).
