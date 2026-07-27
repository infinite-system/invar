import type { Ref } from 'vue';

// invariant: Plugin settings live in contributed schema (settings.invariants.md)
export interface SettingContribution<
  Value extends SettingValue = SettingValue,
> {
  identifier: string;
  label: string;
  section: string;
  defaultValue: Value;
  spec: SettingSpec;
  changed?: (value: Value) => void;
}

export interface RegisteredSetting<Value extends SettingValue = SettingValue> {
  readonly value: Ref<Value>;
  save(): void;
  dispose(): void;
}

export type SettingValue = boolean | number | string | string[];

export type SettingSpec =
  | {
      kind: 'number';
      step: number;
      minimum: number;
      maximum: number;
      decimals: number;
    }
  | { kind: 'boolean' }
  | { kind: 'enum'; options: readonly string[] }
  | { kind: 'dynamic-enum'; resolveOptions: () => readonly string[] };
