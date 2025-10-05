# ADR-001: Retain Lightweight State Container

- **Status**: Accepted
- **Date**: 2025-10-04

## Context
The comparator currently relies on React state combined with bespoke event emitters to drive the ScenarioRunner and lane visualisations. During roadmap planning we considered adopting Zustand/RxJS before building the guided onboarding tour.

## Decision
For the timeline overlay and new telemetry hooks we keep the lightweight emitter approach for this release. It keeps the bundle surface small and avoids premature abstraction while the comparator continues to evolve.

## Consequences
- Guided tours interact with the comparator via the new `window.cdcComparatorClock` API instead of a global store.
- We documented exit criteria (multiple orchestrated tours, server-driven state, or sync with workspace edits) that would justify adopting Zustand/RxJS later.
- Preferences persisted in localStorage now also capture timeline layout and filter state so the lightweight solution still supports UX polish without a new dependency.
