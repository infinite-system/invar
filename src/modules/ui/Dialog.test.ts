import { describe, expect, test } from 'bun:test';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  test('opens each configured dialog with No focused and dismisses safely', () => {
    let confirmationCount = 0;
    const dialog = new Dialog.Class();

    dialog.show({
      identifier: 'terminal-close',
      message: 'Close Terminal?',
      onConfirm: () => {
        confirmationCount += 1;
      },
    });
    expect(dialog.open.value).toBe(true);
    expect(dialog.identifier.value).toBe('terminal-close');
    expect(dialog.message.value).toBe('Close Terminal?');
    expect(dialog.focusedChoice.value).toBe('no');

    dialog.activateFocusedChoice();
    expect(dialog.open.value).toBe(false);
    expect(confirmationCount).toBe(0);
  });

  test('runs only the current dialog confirmation from Yes', () => {
    let confirmationCount = 0;
    const dialog = new Dialog.Class();

    dialog.show({
      identifier: 'quit',
      message: 'Quit?',
      onConfirm: () => {
        confirmationCount += 1;
      },
    });
    dialog.focusNext();
    expect(dialog.focusedChoice.value).toBe('yes');
    dialog.focusPrevious();
    expect(dialog.focusedChoice.value).toBe('no');
    dialog.select('yes');
    dialog.activateFocusedChoice();

    expect(dialog.open.value).toBe(false);
    expect(confirmationCount).toBe(1);
  });

  test('dismiss and each fresh configuration restore the safe No focus', () => {
    const dialog = new Dialog.Class();
    const options = {
      identifier: 'quit',
      message: 'Quit?',
      onConfirm: () => {},
    };

    dialog.show(options);
    dialog.select('yes');
    dialog.dismiss();
    expect(dialog.focusedChoice.value).toBe('no');

    dialog.show(options);
    expect(dialog.open.value).toBe(true);
    expect(dialog.focusedChoice.value).toBe('no');
  });
});
