# Scranton Easter Egg Reference

The app hides a playful **The Office** mode that swaps the default blank workspace for a Scranton-inspired demo environment. This guide documents how to enable it, how each flourish behaves, and the helper utilities that keep the experience contained.

## Opting In And Out
- **UI Toggle** – During onboarding, check the Easter egg switch to seed the Scranton schema. Unchecking starts with the normal empty workspace.
- **Local persistence** – Preference lives in `localStorage` under `cdc_playground_office_opt_in_v1`. Clearing it (or calling `setOfficeSchemaPreference(false)`) restores the vanilla experience.
- **Reset helper** – `resetOfficeShenanigans({ resetMegadesk?: boolean })` clears counters, cooldowns, and toasts and optionally removes the `megadesk-mode` body class. It is invoked whenever scenarios change, the workspace is reset, or an Office-specific modal dismisses.

## Scranton Schema & Lore
- **Schema bootstrap** – `ensureDefaultSchema()` and `startFromScratch()` call `DEFAULT_SCHEMA.map(...)` to materialize the Office columns (`customer_name`, `sales_rep`, `region`, etc.) when the preference is enabled.
- **Sample rows** – `applyOfficeLore(row)` personalises seeded rows with familiar customer names, raises Dwight surcharges, and attaches hidden tooltip metadata so table cells show context hints.
- **Learning prompt** – `showOfficeToastOnce()` pushes “Bears. Beets. Battle-tested schema.” on first activation (or updates the inline status banner when toast notifications are disabled).

## Visual Gags By Action

| Trigger | Function(s) | Result |
| --- | --- | --- |
| Insert row / emit `"c"` events | `emitOfficeStaplerTrail()` | Animated stapler blobs arc from the row editor to the event log instead of the standard sparkle trail. |
| Update row / `"u"` events | `launchOfficeParkour()` (with cooldown) | A “PARKOUR!” banner sprints across the viewport. The first appearance also surfaces an informational toast/status line. |
| Delete row / `"d"` events | `spillKevinChili()` (with cooldown) | Kevin’s chili plummets toward the grid, accompanied by a one-time warning toast/status message. |
| Seed rows repeatedly | `seedRows()` → `officeEasterEgg.seedCount` | On the third consecutive seed run, `showOfficeBankruptcyModal()` prompts “schema bankruptcy” with reset and dismiss buttons. |
| Assemble Megadesk (`⌘/Ctrl + ⇧ + M`) | `toggleMegadeskMode()` → `launchSchruteBucks()` | Adds the `megadesk-mode` class for ambient styling and showers “1 Schrute Buck” coupons the first time per session. A toast or status update explains the reward. |
| General edits | `emitOfficeConfetti()` & `showOfficeToastOnce()` | Confetti bursts celebrate seeded data, while the toast function avoids duplicate messages via internal flags. |

All theatrics respect the feature flag guard `ff_crud_fix`. When toasts are disabled, callbacks fall back to `refreshSchemaStatus()` so copy still appears.

## Failure Guards & Cleanup
- **Cooldowns** – `lastParkourTs` and `lastChiliTs` ensure parkour and chili sequences cannot spam the UI; each helper checks the timestamp before animating.
- **Overlay lifecycle** – Modals (bankruptcy, chili splat, parkour banner) attach `aria-hidden="true"` and clean up via animation completion or `setTimeout` fallbacks so stale DOM nodes do not accumulate.
- **State resets** – In addition to user-initiated resets, helper calls inside `applyScenarioTemplate`, `handleOfficeBankruptcyReset`, and `ensureDefaultSchema` keep the easter egg state in sync when switching scenarios or clearing data. Megadesk is always disabled if the Scranton opt-in is turned off.

## Quick Testing Checklist
1. Enable the Easter egg in onboarding and confirm the Scranton schema loads with lore-filled rows.
2. Insert, update, and delete rows to verify stapler trails, parkour banner, and chili spill appear (and only once every few seconds for updates/deletes).
3. Spam “Seed rows” to trigger the bankruptcy modal, then choose reset to confirm state clears and counters reset.
4. Toggle Megadesk with `Ctrl`/`⌘` + `Shift` + `M`, watch for Schrute Bucks, and ensure a second toggle hides the styling without extra toasts.
5. Disable the preference (or clear `localStorage`) to confirm the workspace reverts to the standard experience with no lingering Office UI.
