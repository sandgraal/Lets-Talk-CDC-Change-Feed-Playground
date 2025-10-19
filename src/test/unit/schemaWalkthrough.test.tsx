import { render, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SchemaWalkthrough } from "../../ui/components/SchemaWalkthrough";

describe("SchemaWalkthrough", () => {
  it("invokes callbacks when buttons are pressed", () => {
    const addSpy = vi.fn();
    const dropSpy = vi.fn();

    const { getByText } = render(
      <SchemaWalkthrough onAdd={addSpy} onDrop={dropSpy} columnName="priority_flag" />,
    );

    fireEvent.click(getByText(/Add priority_flag/i));
    fireEvent.click(getByText(/Drop priority_flag/i));

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(dropSpy).toHaveBeenCalledTimes(1);
  });
});
