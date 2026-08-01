import { Static } from 'ivue/extras';

/** Shared pointer-drag state for ordered UI collections. Geometry stays with each consumer. */
class $DragReorder {
  protected draggingIdentifier: string | null = null;

  constructor(
    protected readonly moveItem: (
      identifier: string,
      targetIndex: number,
    ) => boolean,
  ) {}

  begin(identifier: string): void {
    this.draggingIdentifier = identifier;
  }

  move(targetIndex: number): boolean {
    return this.draggingIdentifier === null
      ? false
      : this.moveItem(this.draggingIdentifier, targetIndex);
  }

  end(): void {
    this.draggingIdentifier = null;
  }
}

export namespace DragReorder {
  export const $Class = Static($DragReorder);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
