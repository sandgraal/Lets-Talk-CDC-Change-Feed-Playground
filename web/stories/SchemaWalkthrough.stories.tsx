import React from "react";
import { SchemaWalkthrough } from "../components/SchemaWalkthrough";

export const Default = () => (
  <SchemaWalkthrough
    columnName="priority_flag"
    onAdd={() => console.info("schema.add")}
    onDrop={() => console.info("schema.drop")}
    status="v2 · column present"
    disableAdd
  />
);

export default {
  title: "Comparator/Schema Walkthrough",
};
