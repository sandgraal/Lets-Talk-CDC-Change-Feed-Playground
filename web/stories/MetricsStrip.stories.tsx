import React from "react";
import { MetricsStrip } from "../components/MetricsStrip";

const base = {
  lagMs: 120,
  throughput: 8,
  deletesPct: 82,
  orderingOk: true,
  consistent: true,
  writeAmplification: 1.4,
  insertCount: 12,
  updateCount: 18,
  deleteCount: 4,
  schemaChangeCount: 1,
};

export const Balanced = () => <MetricsStrip {...base} />;

export const DeleteGap = () => (
  <MetricsStrip
    {...base}
    deletesPct={38}
    orderingOk={false}
    consistent={false}
    writeAmplification={2.6}
    insertCount={20}
    updateCount={24}
    deleteCount={3}
    schemaChangeCount={0}
  />
);

export default {
  title: "Comparator/Metrics Strip",
};
