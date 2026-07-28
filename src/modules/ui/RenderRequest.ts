import { Static } from 'ivue/extras';

// invariant: The render loop never wedges (project.invariants.md)
class $RenderRequest {
  static afterCurrentTurn(requestRender: () => void): void {
    setTimeout(() => requestRender(), 0);
  }
}

export namespace RenderRequest {
  export const $Class = Static($RenderRequest);
  export let Class = $Class;
}
