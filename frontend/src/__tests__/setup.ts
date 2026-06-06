import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Silence console during tests
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
