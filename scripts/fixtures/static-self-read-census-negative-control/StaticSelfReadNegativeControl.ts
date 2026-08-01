class $StaticSelfReadNegativeControl {
  static get VALUE(): number {
    return 1;
  }

  static goodStaticRead(): number {
    return this.VALUE;
  }

  goodInstanceRead(): number {
    return (this.constructor as typeof $StaticSelfReadNegativeControl).VALUE;
  }

  crossClassRead(): number {
    return StaticSelfReadOtherClass.Class.VALUE;
  }
}

class $StaticSelfReadOtherClass {
  static get VALUE(): number {
    return 2;
  }
}

namespace StaticSelfReadNegativeControl {
  export const $Class = $StaticSelfReadNegativeControl;
  export let Class = $Class;
}

namespace StaticSelfReadOtherClass {
  export const $Class = $StaticSelfReadOtherClass;
  export let Class = $Class;
}
