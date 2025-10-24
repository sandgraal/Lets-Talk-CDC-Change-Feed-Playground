# Lane Diff Overlay – Visual Regression Notes

The Ladle stories under `web/stories/LaneDiffOverlay.stories.tsx` capture the
two canonical diff states we reference during reviews.

## Stories to capture
- **IssuesAndLag** – renders missing, extra, ordering issues alongside lag
  samples. Use this for verifying copy, badges, and layout when a lane has
  discrepancies.
- **LagHotspots** – renders a lane with lag samples only. Use this to confirm
  the lag-only callouts and charts remain legible when no issues are present.

## Screenshot guidance
1. Start Ladle with `npm run ladle`.
2. Open each story and capture a full-card screenshot at 1280×720. Include the
   lane header, totals, and lag table.
3. Attach the images to QA checklists and launch reviews so stakeholders can
   compare current visuals with the baselines.
4. Update this document when new diff states or story variants are added.

## File references
- Stories: `web/stories/LaneDiffOverlay.stories.tsx`
- Overlay component: `src/ui/components/LaneDiffOverlay.tsx`
