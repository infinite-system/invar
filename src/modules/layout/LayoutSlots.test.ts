import { expect, test } from 'bun:test';
import { LayoutSlots } from './LayoutSlots';

test('every layout slot size starts unseeded so its owner must seed it', () => {
  const slots = new LayoutSlots.Class();
  expect(slots.primaryDockColumns.value).toBe(0);
  expect(slots.rightDockColumns.value).toBe(0);
  expect(slots.bottomPanelRows.value).toBe(0);
});

test('two slot sets hold independent sizes', () => {
  const firstSlots = new LayoutSlots.Class();
  const secondSlots = new LayoutSlots.Class();
  firstSlots.primaryDockColumns.value = 44;
  firstSlots.rightDockColumns.value = 21;
  firstSlots.bottomPanelRows.value = 9;
  expect(secondSlots.primaryDockColumns.value).toBe(0);
  expect(secondSlots.rightDockColumns.value).toBe(0);
  expect(secondSlots.bottomPanelRows.value).toBe(0);
  expect(firstSlots.primaryDockColumns.value).toBe(44);
});
