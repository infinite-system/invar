#!/usr/bin/env bash
set -uo pipefail

repository_root="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.bun/bin:$PATH"

exec bun "$repository_root/scripts/harness/smoke-monitoring-harness.ts"
