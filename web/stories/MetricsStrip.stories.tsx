import React from "react";
import { MetricsStrip } from "../components/MetricsStrip";

const base = {
  lagMs: 120,
  throughput: 8,
  deletesPct: 82,
  orderingOk: true,
  consistent: true,
};

export const Balanced = () => <MetricsStrip {...base} />;

export const DeleteGap = () => (
  <MetricsStrip
    {...base}
    deletesPct={38}
    orderingOk={false}
    consistent={false}
  />
);

export default {
  title: "Comparator/Metrics Strip",
};
