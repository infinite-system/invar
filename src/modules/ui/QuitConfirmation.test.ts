import { describe, expect, test } from 'bun:test';
import { QuitConfirmation } from './QuitConfirmation';

describe('QuitConfirmation', () => {
  test('opens with No focused and dismisses without quitting', () => {
    let quitCount = 0;
    const confirmation = new QuitConfirmation.Class(() => {
      quitCount += 1;
    });

    confirmation.show();
    expect(confirmation.open.value).toBe(true);
    expect(confirmation.focusedChoice.value).toBe('no');

    confirmation.activateFocusedChoice();
    expect(confirmation.open.value).toBe(false);
    expect(quitCount).toBe(0);
  });

  test('moves focus in both directions and quits only from Yes', () => {
    let quitCount = 0;
    const confirmation = new QuitConfirmation.Class(() => {
      quitCount += 1;
    });

    confirmation.show();
    confirmation.focusNext();
    expect(confirmation.focusedChoice.value).toBe('yes');
    confirmation.focusPrevious();
    expect(confirmation.focusedChoice.value).toBe('no');
    confirmation.select('yes');
    confirmation.activateFocusedChoice();

    expect(confirmation.open.value).toBe(false);
    expect(quitCount).toBe(1);
  });

  test('dismiss and each fresh show restore the safe No focus', () => {
    const confirmation = new QuitConfirmation.Class(() => {});

    confirmation.show();
    confirmation.select('yes');
    confirmation.dismiss();
    expect(confirmation.focusedChoice.value).toBe('no');

    confirmation.show();
    expect(confirmation.open.value).toBe(true);
    expect(confirmation.focusedChoice.value).toBe('no');
  });
});
