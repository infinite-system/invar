import { Reactive } from 'ivue';
import { ref } from 'vue';
import { TextInputModel, type TextInputAction } from '../text/TextInputModel';
import { Dialog } from '../ui/Dialog';

// invariant: Editable text fields share one input model (project.invariants.md)
class $GoToLinePrompt extends Dialog.$Class {
  protected readonly inputModel: TextInputModel.Model;

  constructor() {
    super();
    this.inputModel = this.createInput();
  }

  protected createInput(): TextInputModel.Model {
    return new TextInputModel.Class();
  }

  get input(): TextInputModel.Model {
    return this.inputModel;
  }

  get notice() {
    return ref('');
  }

  override show(): void {
    this.input.clear();
    this.notice.value = '';
    super.show({
      identifier: 'goToLine',
      title: 'Go to Line',
      message: '',
      onConfirm: () => {},
    });
  }

  close(): void {
    this.dismiss();
    this.input.clear();
    this.notice.value = '';
  }

  append(text: string): void {
    this.input.insert(text);
    this.notice.value = '';
  }

  applyInputAction(action: TextInputAction): void {
    this.input.apply(action);
    this.notice.value = '';
  }

  copyInputSelection(): Promise<number> {
    return this.input.copySelection();
  }

  parse(): GoToLineTarget | null {
    const match = /^([1-9]\d*)(?::([1-9]\d*))?$/.exec(this.input.value.trim());
    if (!match) {
      this.notice.value = 'Enter a line or line:column';
      return null;
    }
    return {
      line: Number(match[1]),
      column: match[2] === undefined ? 1 : Number(match[2]),
    };
  }
}

export namespace GoToLinePrompt {
  export const $Class = $GoToLinePrompt;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

export interface GoToLineTarget {
  /** One-based document line. */
  line: number;
  /** One-based grapheme column. */
  column: number;
}
