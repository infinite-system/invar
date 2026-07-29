# Brief — #279: the drive treats a hidden structure pane's "no-document" as unsettled

Read first: [task-279-drive-settle-unsupported-file-structure.md](task-279-drive-settle-unsupported-file-structure.md)
— the record governs; this is verification-integrity work, bycatch of
#274 reproduced twice, with two more family members from #278's landing.

Generator suspect: #266's settled-status registry holds the drive open
on `structureStatus="no-document"` even when the unsupported file
legitimately keeps the pane hidden. The quiescence condition must
distinguish PENDING work from CORRECTLY DECLINED — the structure
record's answers-or-declines component.

Arms:

1. **Reproduce first**: `bun run drive --size 100000` on a .txt (no
   structure provider) times out at 15s AND 30s with a correct final
   frame. Quote the reproduction before changing anything.
2. **Fix at the registry condition** — never widen a timeout.
3. **Both polarities**: the .txt drive settles fast, AND a genuinely
   still-loading structure HOLDS the settle (positive control).
4. **Family member (settings)**: `settingsOpen=true` published before
   the settings labels painted — a text click missed. The settle/status
   contract must not publish an interactable state before its
   interactables paint. Reproduce, then decide whether the same
   registry-condition fix covers it or report the separate generator.

## Invariants in scope

The settled-status records from #266 and the structure
answers-or-declines record in
[structure.invariants.md](../../../../src/modules/structure/structure.invariants.md);
the drive-tool records from #204's landing.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report in the task folder: reproduction quoted, registry fix with
both polarities driven, the settings family member reproduced and
dispositioned, no timeout widened, green `bun test` + drive smokes. The
conductor gates at landing.
