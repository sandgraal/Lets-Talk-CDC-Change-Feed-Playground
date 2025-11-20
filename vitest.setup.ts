import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { resetNanoidCounter } from "./src/utils/nanoid";

beforeEach(() => {
  resetNanoidCounter();
});
