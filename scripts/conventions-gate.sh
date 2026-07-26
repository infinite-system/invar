#!/usr/bin/env bash
# Mechanical convention checks — run at the SAME gate as tsc/tests/checker before every merge.
# Exit 1 on any violation. Legacy files awaiting the item-9 Static conversion are allowlisted;
# the list only ever SHRINKS.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0

# 0) TYPECHECK — a tsc error HARD-BLOCKS the gate. This must run on EVERY gate invocation (merge +
#    delegate review): "measured != enforced" — a build with a type error must never pass the gate.
#    (This is the check that would have caught a mid-edit type error before it could reach a commit.)
bunx="$(command -v bunx || echo "$HOME/.bun/bin/bunx")"
if [ -x "$bunx" ] || command -v bunx >/dev/null 2>&1; then
  if ! "$bunx" tsc --noEmit >/tmp/conventions-gate-tsc.$$.log 2>&1; then
    echo "CONVENTIONS FAIL: tsc --noEmit reported type errors:"
    head -20 /tmp/conventions-gate-tsc.$$.log
    fail=1
  fi
  rm -f /tmp/conventions-gate-tsc.$$.log
else
  echo "CONVENTIONS WARN: bunx not found — skipping tsc (install bun so the gate can typecheck)"
fi

# 0.5) SKILLS INDEX COMPLETENESS: every skill in .claude/skills/ must be named in AGENTS.md's
#      skills index — codex-lineage agents cannot auto-discover the skills directory, so an
#      unindexed skill is invisible to half the fleet. Forgetting is made impossible, not
#      discouraged (ATOMIC-BIND doctrine).
for skill_directory in .claude/skills/*/; do
  skill_name="$(basename "$skill_directory")"
  if ! grep -q "skills/${skill_name}" AGENTS.md; then
    echo "CONVENTIONS FAIL: skill '.claude/skills/${skill_name}' is not mentioned in AGENTS.md's skills index — add a when-to-use line."
    fail=1
  fi
done

# 1) FILE GRAMMAR: module behavior lives on the eponymous class/interface seam; types follow it;
#    tests are colocated and complete. The checker's converted-module set is the ratchet: listed
#    modules block on violations, while unlisted modules print the phase-2 count map without blocking.
bun_binary="$(command -v bun || echo "$HOME/.bun/bin/bun")"
if ! "$bun_binary" scripts/check-file-grammar.ts; then
  echo "CONVENTIONS FAIL: src/modules file grammar:"
  fail=1
fi

# 1.5) EDITABLE-TEXT CENSUS: every one-line input now composes TextInputModel, so the structural
#      census is an enforced zero-count ratchet.
if ! "$bun_binary" scripts/ast-query.ts text-input-census --require-zero; then
  echo "CONVENTIONS FAIL: editable text field outside TextInputModel"
  fail=1
fi

# 2) PUBLIC-CLASS / EXPORTED-CAPABILITY RULE: project classes are published through the namespace
#    pattern; callable module exports are never bare functions/expressions/aliases. Type-aware
#    detection distinguishes class/callable behavior from genuine data collections (keybinding
#    defaults/overlays need no allowlist).
if ! node scripts/check-exported-capabilities.mjs >/tmp/conventions-gate-exported-capabilities.$$.log 2>&1; then
  echo "CONVENTIONS FAIL: direct class/callable export — publish it through the namespace pattern:"
  cat /tmp/conventions-gate-exported-capabilities.$$.log
  fail=1
fi
rm -f /tmp/conventions-gate-exported-capabilities.$$.log

# 3) Naming: banned abbreviation identifiers (declarations only; word-bounded).
abbreviations=$(grep -rnE "\b(const|let|var) (ed|ws|gp|cl|pal|idx|opts|prev|cur|repo|msg|cmd|btn|len)\b *=" src/modules --include='*.ts' | grep -v "__tests__" || true)
if [ -n "$abbreviations" ]; then
  echo "CONVENTIONS FAIL: abbreviated identifier declaration(s):"
  echo "$abbreviations"
  fail=1
fi

# 4) Keybindings: no inline chord conditionals outside the registry/defaults (key.name comparisons).
inline_chords=$(grep -rnE "key\.name === '[a-z0-9]+' && key\.(ctrl|super|option)" src/modules --include='*.ts' | grep -vE "keybindings/|__tests__" || true)
if [ -n "$inline_chords" ]; then
  echo "CONVENTIONS FAIL: inline chord conditional(s) — bindings are registry data:"
  echo "$inline_chords"
  fail=1
fi

# 5) tsc piping (masks exit codes) in scripts.
tsc_pipes=$(grep -rn "tsc --noEmit *|" scripts --include='*.sh' | grep -v "conventions-gate" || true)
if [ -n "$tsc_pipes" ]; then
  echo "CONVENTIONS FAIL: tsc piped (exit code masked):"
  echo "$tsc_pipes"
  fail=1
fi

# 6) ATOMIC-BIND: a file exporting `namespace X { … Static($/Reactive($ }` MUST be named X.ts.
#    Makes convert-without-rename impossible — the incomplete conversion fails the gate.
mismatch=""
while IFS= read -r file; do
  [ -z "$file" ] && continue
  namespace=$(grep -oE "^export namespace [A-Za-z0-9_]+" "$file" | head -1 | awk '{print $3}')
  base=$(basename "$file" .ts)
  if [ -n "$namespace" ] && [ "$namespace" != "$base" ]; then
    mismatch="$mismatch$file (namespace=$namespace, expected $namespace.ts)"$'\n'
  fi
done < <(grep -rlE "Static\(\\\$|Reactive\(\\\$" src/modules --include='*.ts' | grep -vE "\.test\.ts")
if [ -n "$mismatch" ]; then
  echo "CONVENTIONS FAIL: namespace+Static/Reactive file(s) not named after their namespace (atomic-bind):"
  echo "$mismatch"
  fail=1
fi

# 7) $-RAW-FORM: the old '...Implementation' backing-member suffix is banned (use $name).
impl_suffix=$(grep -rnE "[A-Za-z0-9_]+Implementation\b" src/modules --include='*.ts' | grep -vE "\.test\.ts" || true)
if [ -n "$impl_suffix" ]; then
  echo "CONVENTIONS FAIL: '...Implementation'-suffixed member(s) — the raw form is \$name:"
  echo "$impl_suffix"
  fail=1
fi

# 8) NO UNWIRED CAPABILITY: every namespace+Static/Reactive module must have a live caller outside its
#    own file + test (the build-but-don't-wire disease — GitWatcher/DiffView). Delegated to its own
#    script (allowlist + justification live there). This is the generator-level fix: a capability whose
#    only reference is its isolated test now HARD-BLOCKS the gate.
if ! bash "$(dirname "$0")/check-unwired-capabilities.sh" >/tmp/conventions-gate-unwired.$$.log 2>&1; then
  echo "CONVENTIONS FAIL: unwired capability (build-but-don't-wire):"
  cat /tmp/conventions-gate-unwired.$$.log
  fail=1
fi
rm -f /tmp/conventions-gate-unwired.$$.log

# 9) SETTINGS APPLIED-EFFECT META-GATE: every Settings schema field MUST have an applied-effect drive in
#    smoke-settings-applied.sh (the cheap enumeration check — no app launches). A NEW setting without a
#    driving test fails here. The full drive suite runs at the merge gate; this is its enforcing spine.
if ! bash "$(dirname "$0")/smoke-settings-applied.sh" --meta >/tmp/conventions-gate-settings.$$.log 2>&1; then
  echo "CONVENTIONS FAIL: a Settings field has no applied-effect drive:"
  cat /tmp/conventions-gate-settings.$$.log
  fail=1
fi
rm -f /tmp/conventions-gate-settings.$$.log

# 10) MAP-COHERENCE: records are territory — the governance contract + the derived lattice must stay
#    aligned with the actual invariant records. Fails if a governed module lacks its contract (shrinking
#    allowlist) or a lattice link/dependency-map name doesn't resolve to a real ### record. Cheap
#    (no launches), mechanical — same tier as the unwired-capability check.
if ! bash "$(dirname "$0")/check-map-coherence.sh" >/tmp/conventions-gate-mapcoh.$$.log 2>&1; then
  echo "CONVENTIONS FAIL: map incoherence (governance/lattice out of sync with the records):"
  cat /tmp/conventions-gate-mapcoh.$$.log
  fail=1
fi
rm -f /tmp/conventions-gate-mapcoh.$$.log

# 11) PLUGIN CANVAS BOUNDARY: host core may expose generic contribution contracts, but it must not
#     name a concrete plugin, import its module, or dispatch its domain command identifiers.
plugin_core_references=$(rg -n --glob '*.ts' --glob '!*.test.ts' \
  "(from ['\"]\\.\\./git/|\\bGit[A-Z]|['\"]git\\.|['\"]git['\"])" \
  src/modules/workspace/Workspace.ts src/modules/app || true)
if [ -n "$plugin_core_references" ]; then
  echo "CONVENTIONS FAIL: host core names the source-control plugin:"
  echo "$plugin_core_references"
  fail=1
fi

[ "$fail" = 0 ] && echo "conventions-gate: PASS"
exit "$fail"
