import React from "react";
import { LaneDiffOverlay } from "../components/LaneDiffOverlay";
import type { LaneDiffResult } from "../../sim/analysis/diff";

const withIssues: LaneDiffResult = {
  method: "polling",
  totals: {
    missing: 1,
    extra: 1,
    ordering: 1,
  },
  issues: [
    {
      type: "missing",
      op: "d",
      pk: "C-42",
      expectedIndex: 4,
      expectedTime: 1600,
    },
    {
      type: "extra",
      op: "u",
      pk: "C-7",
      actualIndex: 6,
      actualTime: 2100,
    },
    {
      type: "ordering",
      op: "u",
      pk: "C-9",
      expectedIndex: 2,
      actualIndex: 3,
    },
  ],
  lag: {
    max: 940,
    samples: [
      {
        op: "u",
        pk: "C-42",
        expectedTime: 1600,
        actualTime: 2540,
        lagMs: 940,
      },
      {
        op: "d",
        pk: "C-7",
        expectedTime: 1900,
        actualTime: 2500,
        lagMs: 600,
      },
    ],
  },
};

const lagOnly: LaneDiffResult = {
  method: "trigger",
  totals: {
    missing: 0,
    extra: 0,
    ordering: 0,
  },
  issues: [],
  lag: {
    max: 480,
    samples: [
      {
        op: "c",
        pk: "SKU-1",
        expectedTime: 1200,
        actualTime: 1680,
        lagMs: 480,
      },
      {
        op: "u",
        pk: "SKU-2",
        expectedTime: 1400,
        actualTime: 1750,
        lagMs: 350,
      },
    ],
  },
};

export const IssuesAndLag = () => (
  <LaneDiffOverlay diff={withIssues} scenarioName="storybook" />
);

export const LagHotspots = () => (
  <LaneDiffOverlay diff={lagOnly} scenarioName="storybook" />
);

export default {
  title: "Comparator/Lane Diff Overlay",
};
