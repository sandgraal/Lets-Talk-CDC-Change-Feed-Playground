import React from "react";
import { MetricsStrip } from "../components/MetricsStrip";

const base = {
  lagMs: 120,
  throughput: 8,
  deletesPct: 82,
  orderingOk: true,
  consistent: true,
  writeAmplification: 1.4,
};

export const Balanced = () => <MetricsStrip {...base} />;

export const DeleteGap = () => (
  <MetricsStrip
    {...base}
    deletesPct={38}
    orderingOk={false}
    consistent={false}
    writeAmplification={2.6}
  />
);

export default {
  title: "Comparator/Metrics Strip",
};
