# 539 — module constants to statics

Priority: architecture-hygiene
State: IN-PROGRESS
Engine: claude
Environment: linux
Model: fable-5
Effort: medium

## In plain words

Four regex/set constants in PluginManifest.ts are the last module-level
variables in the whole source tree. Move them onto the class as cached
static getters so the module-variable count reaches a true zero and the
gate can hold it there.

## Source of truth

tmp/TASK-module-constants-to-statics.md — the full spec from the
ivue-side Fable via the user: exact getter shapes, the four call sites,
safety notes (no /g lastIndex hazard; read cost 6 orders below the
admission path), and the gate follow-through (vendors into the
converted-module ratchet set if the count reaches zero).
