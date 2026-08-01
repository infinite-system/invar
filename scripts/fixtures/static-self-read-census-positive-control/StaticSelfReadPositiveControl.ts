class $StaticSelfReadPositiveControl {
  static get VALUE(): number {
    return 1;
  }

  static badStaticRead(): number {
    return $StaticSelfReadPositiveControl.VALUE;
  }

  badInstanceRead(): number {
    return StaticSelfReadPositiveControl.Class.VALUE;
  }
}

namespace StaticSelfReadPositiveControl {
  export const $Class = $StaticSelfReadPositiveControl;
  export let Class = $Class;
}
