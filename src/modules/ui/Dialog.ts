import { Reactive } from 'ivue';
import { ref } from 'vue';

/** One modal dialog model for confirmations and prompts. */
class $Dialog {
  protected confirmAction: (() => void) | null = null;

  get open() {
    return ref(false);
  }
  get focusedChoice() {
    return ref<DialogChoice>('no');
  }
  get identifier() {
    return ref('');
  }
  get title() {
    return ref('Invar');
  }
  get message() {
    return ref('');
  }
  get confirmLabel() {
    return ref('Yes');
  }
  get cancelLabel() {
    return ref('No');
  }
  get hint() {
    return ref('Left/Right or Tab, then Enter');
  }

  show(options: DialogOptions): void {
    this.identifier.value = options.identifier;
    this.title.value = options.title ?? 'Invar';
    this.message.value = options.message;
    this.confirmLabel.value = options.confirmLabel ?? 'Yes';
    this.cancelLabel.value = options.cancelLabel ?? 'No';
    this.hint.value = options.hint ?? 'Left/Right or Tab, then Enter';
    this.confirmAction = options.onConfirm;
    this.focusedChoice.value = 'no';
    this.open.value = true;
  }

  dismiss(): void {
    this.open.value = false;
    this.focusedChoice.value = 'no';
    this.confirmAction = null;
  }

  select(choice: DialogChoice): void {
    this.focusedChoice.value = choice;
  }

  focusPrevious(): void {
    this.focusedChoice.value =
      this.focusedChoice.value === 'yes' ? 'no' : 'yes';
  }

  focusNext(): void {
    this.focusPrevious();
  }

  activateFocusedChoice(): void {
    if (!this.open.value) return;
    const confirmed = this.focusedChoice.value === 'yes';
    const confirmAction = this.confirmAction;
    this.dismiss();
    if (confirmed) confirmAction?.();
  }
}

export namespace Dialog {
  export const $Class = $Dialog;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
}

export type DialogChoice = 'yes' | 'no';

export interface DialogOptions {
  readonly identifier: string;
  readonly title?: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly hint?: string;
  readonly onConfirm: () => void;
}
