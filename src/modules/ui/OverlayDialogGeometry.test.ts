import { describe, expect, test } from 'bun:test';
import { OverlayDialogGeometry } from './OverlayDialogGeometry';

describe('OverlayDialogGeometry', () => {
  test('clamps every edge and close target inside a resized terminal', () => {
    const geometry = OverlayDialogGeometry.Class.layout({
      screenWidth: 18,
      screenHeight: 7,
      desiredLeft: 40,
      desiredTop: 20,
      desiredWidth: 80,
      desiredHeight: 30,
    });

    expect(geometry).toEqual({
      left: 0,
      top: 0,
      width: 18,
      height: 7,
      interiorWidth: 16,
      interiorHeight: 5,
      closeButtonLeft: 15,
      closeButtonTop: 0,
      closeButtonWidth: 3,
    });
  });

  test('centers a fitting dialog and keeps its close target on the top edge', () => {
    const geometry = OverlayDialogGeometry.Class.layout({
      screenWidth: 100,
      screenHeight: 40,
      desiredTop: 2,
      desiredWidth: 60,
      desiredHeight: 20,
    });

    expect(geometry.left).toBe(20);
    expect(geometry.top).toBe(2);
    expect(geometry.closeButtonLeft).toBe(77);
    expect(geometry.closeButtonTop).toBe(2);
  });

  test('remains valid for a one-cell terminal', () => {
    const geometry = OverlayDialogGeometry.Class.layout({
      screenWidth: 0,
      screenHeight: 0,
      desiredWidth: 60,
      desiredHeight: 20,
    });

    expect(geometry.width).toBe(1);
    expect(geometry.height).toBe(1);
    expect(geometry.closeButtonLeft).toBe(0);
    expect(geometry.closeButtonWidth).toBe(1);
  });

  test('reserves preferred margins while content fits', () => {
    const geometry = OverlayDialogGeometry.Class.layout({
      screenWidth: 120,
      screenHeight: 40,
      desiredWidth: 78,
      desiredHeight: 50,
      horizontalMargin: 2,
      verticalMargin: 3,
    });

    expect(geometry).toMatchObject({
      left: 21,
      top: 3,
      width: 78,
      height: 34,
    });
  });

  test('margins yield before a tiny terminal clips the dialog away', () => {
    const geometry = OverlayDialogGeometry.Class.layout({
      screenWidth: 4,
      screenHeight: 3,
      desiredWidth: 78,
      desiredHeight: 50,
      horizontalMargin: 3,
      verticalMargin: 3,
    });

    expect(geometry).toMatchObject({
      left: 1,
      top: 1,
      width: 2,
      height: 1,
    });
  });
});
