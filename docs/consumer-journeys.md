# Consumer world: capabilities, journeys and step counts

How a person gets things done in `/world`, before and after the simplification on branch `consumer-ux`.
Requirements are PRD §8 (consumer world), §9 (FR-05 to FR-16), §10.1–10.3 and §13.2 (information hierarchy).
No consumer capability was added or removed. What changed is how each one is reached, confirmed and undone.

Regression check: `npm run e2e` runs the first-time-user scenarios (A–K) below in real Chrome.

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
