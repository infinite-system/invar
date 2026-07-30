import { describe, expect, test } from 'bun:test';
import { DoubleClickGesture } from './DoubleClickGesture';

describe('DoubleClickGesture', () => {
  test('a second press on the same target inside the interval is a double click', () => {
    const gesture = new DoubleClickGesture.Class();
    expect(gesture.recordPressAndDetectDoubleClick('link:a', 1_000)).toBe(
      false,
    );
    expect(gesture.recordPressAndDetectDoubleClick('link:a', 1_200)).toBe(true);
  });

  test('a slow second press on the same target is two single presses', () => {
    const gesture = new DoubleClickGesture.Class();
    expect(gesture.recordPressAndDetectDoubleClick('link:a', 1_000)).toBe(
      false,
    );
    expect(gesture.recordPressAndDetectDoubleClick('link:a', 1_500)).toBe(
      false,
    );
  });

  test('a fast press on a different target is not a double click', () => {
    const gesture = new DoubleClickGesture.Class();
    expect(gesture.recordPressAndDetectDoubleClick('link:a', 1_000)).toBe(
      false,
    );
    expect(gesture.recordPressAndDetectDoubleClick('link:b', 1_050)).toBe(
      false,
    );
    // The differing press becomes the new anchor, so its own repeat still counts.
    expect(gesture.recordPressAndDetectDoubleClick('link:b', 1_100)).toBe(true);
  });

  test('forgetting the previous press disarms the next one', () => {
    const gesture = new DoubleClickGesture.Class();
    gesture.recordPressAndDetectDoubleClick('link:a', 1_000);
    gesture.forgetPreviousPress();
    expect(gesture.recordPressAndDetectDoubleClick('link:a', 1_050)).toBe(
      false,
    );
  });

  test('two independent surfaces keep independent gestures', () => {
    const previewGesture = new DoubleClickGesture.Class();
    const logGesture = new DoubleClickGesture.Class();
    previewGesture.recordPressAndDetectDoubleClick('link:a', 1_000);
    expect(logGesture.recordPressAndDetectDoubleClick('link:a', 1_050)).toBe(
      false,
    );
  });
});
