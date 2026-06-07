import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// With `globals: false`, Testing Library's automatic post-test cleanup is not
// registered, so unmount rendered trees between tests to avoid DOM bleed
// (duplicate elements across `render` calls in the same file).
afterEach(() => {
  cleanup();
});
