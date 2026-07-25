import { expect, test } from "bun:test";
import { Viewport } from "./Viewport";

test("keeps a target line within the window", () => {
  const viewport = new Viewport.Class();
  viewport.setSize(80, 10);
  viewport.scrollToLine(50, 100);
  expect(viewport.firstVisible).toBeLessThanOrEqual(50);
  expect(viewport.firstVisible + 10).toBeGreaterThan(50);
  viewport.scrollToLine(0, 100);
  expect(viewport.firstVisible).toBe(0);
});

test("never scrolls past the last page", () => {
  const viewport = new Viewport.Class();
  viewport.setSize(80, 10);
  viewport.scrollBy(1000, 30);
  expect(viewport.firstVisible).toBe(20);
});
