// Shared wheel-gesture math: whether the configured scroll modifier is held, and how many rows one
// wheel notch moves (linesPerNotch × the fast-scroll factor when its modifier is held). Both the
// sidebar and the editor scroll handlers use these, so they live in one Static capability rather than
// duplicated in each pane controller. Pure: reads only the event modifiers and the settings values.
//
// invariant: The wheel gesture resolves through one settings-sourced step (src/modules/ui/ui.invariants.md)
import { Static } from 'ivue/extras';
import type { ScrollModifier, Settings } from '../settings/Settings';

class $ScrollGesture {
  public static modifierHeld(
    event: WheelModifiers,
    modifier: ScrollModifier,
  ): boolean {
    switch (modifier) {
      case 'alt':
        return event.modifiers.alt;
      case 'shift':
        return event.modifiers.shift;
      case 'ctrl':
        return event.modifiers.ctrl;
      default:
        return false; // 'none'
    }
  }
  public static wheelStep(
    event: WheelModifiers,
    settings: Settings.Instance,
  ): number {
    const notch = Math.max(1, Math.round(settings.linesPerNotch.value));
    const fast = this.modifierHeld(event, settings.fastScrollModifier.value)
      ? Math.max(1, Math.round(settings.fastScrollMultiplier.value))
      : 1;
    return notch * fast;
  }
}

export namespace ScrollGesture {
  export const $Class = Static($ScrollGesture);
  export let Class = $Class;
}

export interface WheelModifiers {
  modifiers: {
    alt: boolean;
    shift: boolean;
    ctrl: boolean;
  };
}
