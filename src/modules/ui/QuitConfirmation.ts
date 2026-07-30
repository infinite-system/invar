import { Reactive } from 'ivue';
import { ref } from 'vue';

// invariant: Quit requires explicit confirmation (src/modules/app/app.invariants.md)
class $QuitConfirmation {
  constructor(protected readonly confirmQuit: () => void) {}

  get open() {
    return ref(false);
  }
  get focusedChoice() {
    return ref<QuitConfirmationChoice>('no');
  }

  show(): void {
    this.focusedChoice.value = 'no';
    this.open.value = true;
  }

  dismiss(): void {
    this.open.value = false;
    this.focusedChoice.value = 'no';
  }

  select(choice: QuitConfirmationChoice): void {
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
    this.dismiss();
    if (confirmed) this.confirmQuit();
  }
}

export namespace QuitConfirmation {
  export const $Class = $QuitConfirmation;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
}

export type QuitConfirmationChoice = 'yes' | 'no';
