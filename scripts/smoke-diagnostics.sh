#!/usr/bin/env bash
# Driven TS-diagnostics render contract. The TypeScript harness exercises both
# supported language servers through the real TUI and FrameProbe.
# invariant: TS diagnostics render as an underline and overview mark (src/modules/ui/ui.invariants.md)
# invariant: Diagnostics reach the store by push or pull (src/modules/lsp/lsp.invariants.md)
set -uo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIRECTORY/.." && pwd)"

cd "$PROJECT_ROOT"
exec bun scripts/harness/smoke-diagnostics-harness.ts
