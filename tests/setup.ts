import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without globals, so Testing Library cannot register its own
// auto-cleanup. Without this, DOM from one test leaks into the next and
// duplicate-text queries fail.
afterEach(cleanup);
