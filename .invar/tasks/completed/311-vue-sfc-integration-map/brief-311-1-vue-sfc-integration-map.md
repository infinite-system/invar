# Brief — #311: Vue SFC integration MAP (research pre-task, ZERO product code)

Read first: [task-311-vue-sfc-integration-map.md](task-311-vue-sfc-integration-map.md)
— USER-DIRECTED; his verbatim words (including the pluggability
follow-up) are in the record and GOVERN. The record's seven map
sections + the pluggability section ARE the deliverable spec.

Discipline:

- NO product code, NO src/ changes. The deliverable is
  a new file named project-vue-integration-map (markdown) in your task folder, committed to
  your branch (SKIP_GATE=1 is CORRECT here — record-only commit).
- Every claim about CURRENT Invar behaviour must be DRIVEN: open a real
  .vue fixture in the PTY harness and quote the frames (highlighting,
  structure pane, hover, diagnostics). No structural reads presented as
  fact — measure before briefing a cause.
- Every ecosystem claim (volar/@vue/language-server, hybrid vs takeover
  mode, grammar injection) carries a citation (WebFetch the actual
  docs/READMEs; quote them).
- Ground the pluggability section in our ACTUAL plugin records: read
  [plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md), the LspWorkspaceProvider lifecycle, the
  runtime-plugin seams (#296 just exercised them). Name every
  attachment seam; flag any core hack a Vue plugin would need — those
  become pre-work items in the phasing.
- The phasing ends with per-phase acceptance drives and an explicit
  OUT-of-scope boundary list.
- End state: map committed, READY report summarising the map with its
  open questions ranked. The USER reviews the map before #312 exists as
  work.

## Invariants in scope

plugins records, LSP records, structure records, editor grammar records
— read, not modify.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.
