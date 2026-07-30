# #406 — SettingSpec has no free-text kind

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low

## Origin — #402 bycatch 5

SettingContribution.interface.ts offers number/boolean/enum/dynamic-enum
only. A contributed path or file-name setting is impossible — #402's log
path had to be a constant + env override. Add a 'text' kind (with
optional validation hook), thread it through the settings pane row
painter and persistence, and convert the monitoring log path to it as
the proving consumer.
