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

# 1.6) HASH-PRIVATE CENSUS: Static() publishes a subclass receiver, which
#      cannot access a #private name declared by its superclass. Parse the
#      syntax so comments and strings containing a hash cannot trip the ban.
if ! "$bun_binary" scripts/ast-query.ts hash-private-members \
  --require-zero; then
  echo "CONVENTIONS FAIL: #private member prevents Static() subclass access"
  fail=1
fi

# 1.75) STATIC-GETTER NAMING: cached versus uncached is the `$` axis; literal versus derived is
#       the CASE axis. Parse getter bodies so comments, strings, and instance knobs cannot satisfy
#       or trip the rule by textual coincidence.
if ! "$bun_binary" scripts/check-static-getter-naming.ts; then
  echo "CONVENTIONS FAIL: static getter literal/derived naming"
  fail=1
fi

# 1.8) IMMUTABLE INHERITANCE ANCHOR: an extends clause must never snapshot the mutable Class slot.
mutable_class_extends=$(grep -rnE 'extends [A-Za-z_][A-Za-z0-9_]*\.Class\b' src scripts --include='*.ts' || true)
if [ -n "$mutable_class_extends" ]; then
  echo "CONVENTIONS FAIL: extends uses a mutable Class slot — extend the immutable \$Class anchor:"
  echo "$mutable_class_extends"
  fail=1
fi

# 1.9) THE Class SLOT STAYS MUTABLE: `Class` is the swappable slot — a test double, a Reactive
#      wrapper, or a downstream customization replaces it in place. `const` freezes the slot and
#      makes the class un-extensible, which contradicts the always-extensible invariant. The
#      IMMUTABLE anchor is `$Class` (always `const`); `Class` is always `let`.
frozen_class_slot=$(grep -rnE '^\s*(export )?const Class\b\s*=' src scripts --include='*.ts' || true)
if [ -n "$frozen_class_slot" ]; then
  echo "CONVENTIONS FAIL: the Class slot is const — it must be \`export let Class = …\` so a"
  echo "double, a Reactive wrapper, or a customization can replace it (\$Class stays const):"
  echo "$frozen_class_slot"
  fail=1
fi

# 1.95) THE WRAPPER LIVES AT THE ANCHOR: `Static()` returns a NEW SUBCLASS, so
#       `$Class = $Raw; Class = Static($Class)` leaves the ANCHOR unwrapped — and
#       `extends X.$Class` then inherits a class whose `$`-getters never cache.
#       That is the recomputation-on-every-read defect that made the app unusable
#       twice on 2026-07-27. Required shape: `$Class = Static($Raw); Class = $Class`.
#       NOT applicable to `Reactive()`, which mutates IN PLACE — there the raw class
#       IS the reactive class, so `Class = Reactive($Class)` is correct.
wrapper_off_anchor=$(grep -rnE '^\s*export (const|let) Class = Static\(' src scripts --include='*.ts' || true)
if [ -n "$wrapper_off_anchor" ]; then
  echo "CONVENTIONS FAIL: Static() wraps at the Class slot, leaving \$Class unwrapped."
  echo "Static() returns a NEW subclass, so \`extends X.\$Class\` would get uncached"
  echo "\$-getters. Use: export const \$Class = Static(\$Raw); export let Class = \$Class;"
  echo "$wrapper_off_anchor"
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

# 9) MAP-COHERENCE: records are territory — the governance contract + the derived lattice must stay
#    aligned with the actual invariant records. Fails if a governed module lacks its contract (shrinking
#    allowlist) or a lattice link/dependency-map name doesn't resolve to a real ### record. Cheap
#    (no launches), mechanical — same tier as the unwired-capability check.
if ! bash "$(dirname "$0")/check-map-coherence.sh" >/tmp/conventions-gate-mapcoh.$$.log 2>&1; then
  echo "CONVENTIONS FAIL: map incoherence (governance/lattice out of sync with the records):"
  cat /tmp/conventions-gate-mapcoh.$$.log
  fail=1
fi
rm -f /tmp/conventions-gate-mapcoh.$$.log

# 10) RETIRED SMOKE REFERENCES: parked content is searchable but no longer
#     authoritative. Live records, scripts, registrations, and project docs must
#     not cite a file beneath the retirement directory.
if ! bash scripts/check-retired-smoke-references.sh; then
  echo "CONVENTIONS FAIL: live file cites a retired smoke"
  fail=1
fi

# 11) PLUGIN CANVAS BOUNDARY: host core may expose generic contribution
#     contracts, but it must not
#     name a concrete plugin, import its module, or dispatch its domain command identifiers.
#     THIS CHECK CALLED `rg`, WHICH IS NOT INSTALLED HERE, AND `|| true` SWALLOWED THE ERROR — so it
#     passed unconditionally and the entire plugin-canvas boundary was unenforced. (Found twice
#     independently; the merge gate's smoke-classification guard and its liveness probe were two more
#     instances of the same class.) Now `grep -E`, and every matcher is paired with a POSITIVE
#     CONTROL: a known-VIOLATING line it must detect before its silence about the real files is
#     trusted, plus a refusal to pass having inspected zero files. A boundary check that cannot fail
#     is worse than no boundary check, because it reports safety it does not provide.
#     This step is the enforcement half of the project record "The host canvas is complete without
#     plugins" (project.invariants.md), whose Evidence names it.
plugin_boundary_paths=(
  src/modules/workspace/Workspace.ts
  src/modules/app
  src/modules/keybindings
  src/modules/settings
)
plugin_boundary_scan() {
  # $1 = extended-regex matcher. Prints "path:line:text" for each violation.
  grep -rEn --include='*.ts' --exclude='*.test.ts' -- "$1" \
    "${plugin_boundary_paths[@]}" 2>/dev/null || true
}
plugin_boundary_inspected_file_count() {
  find "${plugin_boundary_paths[@]}" -name '*.ts' ! -name '*.test.ts' 2>/dev/null | wc -l
}
plugin_boundary_positive_control() {
  # $1 = plugin label, $2 = matcher, $3 = a known-VIOLATING line the matcher MUST detect.
  # Returns non-zero (and fails the gate) when the matcher cannot see its own known violation, or
  # when the paths it would scan hold no files at all.
  if [ "$(plugin_boundary_inspected_file_count)" -eq 0 ]; then
    echo "CONVENTIONS FAIL: the $1 boundary check inspected NO files — the host-core paths moved or"
    echo "  vanished, so its silence proves nothing."
    fail=1
    return 1
  fi
  if printf '%s\n' "$3" | grep -qE -- "$2"; then return 0; fi
  echo "CONVENTIONS FAIL: the $1 boundary matcher failed its POSITIVE CONTROL —"
  echo "  it did not detect the known violation: $3"
  echo "  (the matcher is broken; it would have reported a clean core no matter what)"
  fail=1
  return 1
}

# ONE mechanism for every domain: a per-file SHRINKING ALLOWLIST in
# scripts/plugin-boundary-baseline.txt. A host-core file with ANY reference must be listed with a
# maximum count. So "zero tolerance" needs no second code path — it is simply the absence of a row:
# a domain that has finished extracting has no rows for the files it left, and one reference there
# fails immediately. New coupling fails today even while an in-flight domain still has known sites,
# and a decrease prints tightenable slack rather than failing an improvement.
plugin_boundary_check() {
  local domain="$1" plugin_label="$2" matcher="$3" positive_control="$4"
  plugin_boundary_positive_control "$plugin_label" "$matcher" "$positive_control" || return
  local baseline_file="$(dirname "$0")/plugin-boundary-baseline.txt" allowed path count
  while IFS= read -r counted; do
    path="${counted%:*}"
    count="${counted##*:}"
    [ "$count" = 0 ] && continue
    allowed="$(awk -v domain="$domain" -v path="$path" \
      '$1 == domain && $2 == path { print $3 }' "$baseline_file")"
    if [ -z "$allowed" ]; then
      echo "CONVENTIONS FAIL: ${path} names the ${plugin_label} plugin (${count} line(s)) and is not"
      echo "  on the ${domain} boundary allowlist — host core may not take on NEW plugin coupling."
      plugin_boundary_scan "$matcher" | grep -F "${path}:"
      fail=1
    elif [ "$count" -gt "$allowed" ]; then
      echo "CONVENTIONS FAIL: ${path} grew its ${plugin_label} coupling: ${count} line(s) > allowed ${allowed}."
      echo "  The ${domain} allowlist only ever shrinks (see project.canvas-census.md)."
      plugin_boundary_scan "$matcher" | grep -F "${path}:"
      fail=1
    elif [ "$count" -lt "$allowed" ]; then
      echo "conventions-gate: BOUNDARY RATCHET SLACK — ${path} is down to ${count} ${plugin_label} line(s)"
      echo "  from an allowed ${allowed}; tighten scripts/plugin-boundary-baseline.txt in this commit."
    fi
  done < <(grep -rEnc --include='*.ts' --exclude='*.test.ts' -- "$matcher" \
    "${plugin_boundary_paths[@]}" 2>/dev/null || true)
}

plugin_boundary_check 'source-control' 'source-control' \
  "(from ['\"]\.\./git/|\bGit[A-Z]|\bgit[A-Z]|['\"]git\.|['\"]git['\"])" \
  "get gitSplitRatio() { return ref(0.5); }"
plugin_boundary_check 'comparison' 'source-control (comparison view)' \
  "([Dd]iff[A-Z]|\bdiff[A-Z]|\bshowingDiff\b|from ['\"]\.\./diff/|['\"]diff\.)" \
  "const request = workspaceSet.active.diffRequest.value;"
plugin_boundary_check 'markdown' 'markdown' \
  "([Mm]arkdown|from ['\"]\.\./markdown/|['\"]markdown\.)" \
  "workspaceSet.active.toggleMarkdownPreview();"
plugin_boundary_check 'file-tree' 'file tree' \
  "([Ff]ileTree|\btree[A-Z]|\bfocusFiles\b|\bfiles\.|\btree\.|view\.(show|focus)Files|['\"]files['\"])" \
  "workspaceSet.active.tree.moveSelection(-1);"

[ "$fail" = 0 ] && echo "conventions-gate: PASS"
exit "$fail"
