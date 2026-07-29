import { expect, test } from 'bun:test';
import { TextViewport } from './TextViewport';

test('keeps a target line within the window', () => {
  const viewport = new TextViewport.Class();
  viewport.setSize(80, 10);
  viewport.scrollToLine(50, 100);
  expect(viewport.firstVisible).toBeLessThanOrEqual(50);
  expect(viewport.firstVisible + 10).toBeGreaterThan(50);
  viewport.scrollToLine(0, 100);
  expect(viewport.firstVisible).toBe(0);
});

test('never scrolls past the last page', () => {
  const viewport = new TextViewport.Class();
  viewport.setSize(80, 10);
  viewport.scrollBy(1000, 30);
  expect(viewport.firstVisible).toBe(20);
});

test('reading jumps keep two context rows above the target', () => {
  expect(TextViewport.Class.scrollTopForTarget(50, 0, 15, 100, 'reading')).toBe(
    48,
  );
  expect(
    TextViewport.Class.scrollTopForTarget(50, 45, 15, 100, 'nearest'),
  ).toBe(45);
  expect(TextViewport.Class.scrollTopForTarget(50, 0, 2, 100, 'reading')).toBe(
    50,
  );
});
