import React from "react";
import { MetricsDashboard } from "../components/MetricsDashboard";

const lanes = [
  {
    id: "polling",
    label: "Polling",
    produced: 48,
    consumed: 42,
    backlog: 6,
    lagP50: 420,
    lagP95: 980,
    missedDeletes: 3,
    snapshotRows: 120,
    inserts: 18,
    updates: 20,
    deletes: 10,
    schemaChanges: 2,
  },
  {
    id: "trigger",
    label: "Trigger",
    produced: 48,
    consumed: 48,
    backlog: 0,
    lagP50: 85,
    lagP95: 140,
    writeAmplification: 2.4,
    snapshotRows: 48,
    inserts: 16,
    updates: 22,
    deletes: 10,
    schemaChanges: 1,
  },
  {
    id: "log",
    label: "Log",
    produced: 48,
    consumed: 48,
    backlog: 0,
    lagP50: 35,
    lagP95: 60,
    snapshotRows: 120,
    inserts: 18,
    updates: 24,
    deletes: 6,
  },
];

export const Default = () => <MetricsDashboard lanes={lanes} />;

export default {
  title: "Comparator/Metrics Dashboard",
};
