import { Static } from 'ivue/extras';
import type { SettingSpec } from './SettingContribution.interface';

class $SettingSpecs {
  static dynamicEnum(resolveOptions: () => readonly string[]): SettingSpec {
    return { kind: 'dynamic-enum', resolveOptions };
  }
}

export namespace SettingSpecs {
  export const $Class = Static($SettingSpecs);
  export let Class = $Class;
}
