import { describe, expect, test } from 'bun:test';
import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  test('behavior remains constructible through its class seam', () => {
    expect(Sidebar.Class).toBeDefined();
  });

  test('reads contributed pointer geometry live after host layout changes', () => {
    const pointerCalls: unknown[] = [];
    const wheelCalls: unknown[] = [];
    const paneContent = {
      onFocus: () => {},
      onHorizontalWheel: (
        columnDelta: number,
        context: {
          column: number;
          row: number;
        },
      ) => {
        wheelCalls.push({ columnDelta, context });
        return true;
      },
      onPointerDown: (
        column: number,
        row: number,
        context: {
          screenColumn: number;
          screenRow: number;
        },
      ) => {
        pointerCalls.push({ column, row, context });
        return true;
      },
    };
    const sidebarRenderable: {
      onMouseScroll?: (event: {
        x: number;
        y: number;
        modifiers: {
          alt: boolean;
          shift: boolean;
          ctrl: boolean;
        };
        scroll: { direction: 'right' };
      }) => void;
      onMouseDown?: (event: {
        x: number;
        y: number;
        button: number;
        modifiers: {
          alt: boolean;
          shift: boolean;
          ctrl: boolean;
        };
      }) => void;
    } = {};
    const contentBody = { x: 4, y: 3 };
    new Sidebar.Class({
      renderer: { requestRender: () => {} },
      sidebar: sidebarRenderable,
      contentBody,
      primaryDockHost: {
        activeContent: paneContent,
        focus: () => {},
      },
      tooltip: { clear: () => {} },
      settings: {
        linesPerNotch: { value: 3 },
        fastScrollModifier: { value: 'none' },
        fastScrollMultiplier: { value: 5 },
        horizontalScrollModifier: { value: 'alt' },
      },
    } as never);

    sidebarRenderable.onMouseScroll?.({
      x: 18,
      y: 21,
      scroll: { direction: 'right' },
      modifiers: { alt: false, shift: false, ctrl: false },
    });
    sidebarRenderable.onMouseDown?.({
      x: 18,
      y: 21,
      button: 1,
      modifiers: { alt: false, shift: false, ctrl: false },
    });
    contentBody.x = 9;
    contentBody.y = 6;
    sidebarRenderable.onMouseScroll?.({
      x: 24,
      y: 27,
      scroll: { direction: 'right' },
      modifiers: { alt: false, shift: false, ctrl: false },
    });
    sidebarRenderable.onMouseDown?.({
      x: 24,
      y: 27,
      button: 1,
      modifiers: { alt: false, shift: false, ctrl: false },
    });

    expect(pointerCalls).toEqual([
      {
        column: 14,
        row: 18,
        context: {
          screenColumn: 18,
          screenRow: 21,
          button: 1,
          modifiers: { alt: false, shift: false, ctrl: false },
        },
      },
      {
        column: 15,
        row: 21,
        context: {
          screenColumn: 24,
          screenRow: 27,
          button: 1,
          modifiers: { alt: false, shift: false, ctrl: false },
        },
      },
    ]);
    expect(wheelCalls).toEqual([
      {
        columnDelta: 3,
        context: {
          column: 14,
          row: 18,
          modifiers: { alt: false, shift: false, ctrl: false },
        },
      },
      {
        columnDelta: 3,
        context: {
          column: 15,
          row: 21,
          modifiers: { alt: false, shift: false, ctrl: false },
        },
      },
    ]);
  });
});
