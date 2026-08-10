#!/usr/bin/env bash
# Portable shell primitives for the gate scripts — pure bash 5, ZERO external tools, so the gate
# behaves identically on Linux (GNU userland) and macOS (BSD userland). bash 5 is the ONE
# dependency (install.sh guarantees it on both platforms; Linux ships it, macOS gets it from brew).
# This file is SOURCED, never executed.
#
# Why this exists: two GNU-isms in the gate path have no BSD equivalent and silently produce wrong
# results on macOS rather than failing loudly —
#   * `date +%sN`/`+%s%3N` — BSD `date` has no `%N`, so it emits a literal "…N" and every timing
#     subtraction throws "value too great for base".
#   * `readlink -f` — BSD `readlink` has no `-f`; and even where present it is used to compare paths
#     that differ only by a symlinked prefix (`/tmp` -> `/private/tmp` on macOS), so the comparison
#     must physically resolve BOTH sides.

# Millisecond epoch. EPOCHREALTIME is a bash-5 builtin, "seconds.microseconds"; stripping every
# non-digit is locale-independent (some locales use a comma radix). microseconds/1000 = ms.
epoch_ms() {
  local digits="${EPOCHREALTIME//[!0-9]/}"
  printf '%s\n' "$((10#${digits:-0} / 1000))"
}

# Nanosecond-shaped epoch (microsecond precision, ns-width). Used only for unique-suffix building,
# where width matters and sub-microsecond precision does not.
epoch_ns() {
  local digits="${EPOCHREALTIME//[!0-9]/}"
  printf '%s\n' "${digits:-0}000"
}

# ISO-8601 local timestamp to the microsecond. GNU `date -Ins` is unportable (BSD `date` has no
# `-I`/`%N`); compose it from a portable `date` format plus EPOCHREALTIME's fractional part.
iso_now() {
  local fraction="${EPOCHREALTIME#*.}"
  printf '%s.%s%s\n' "$(date +%Y-%m-%dT%H:%M:%S)" "${fraction:-000000}" "$(date +%z)"
}

# Absolute PHYSICAL path (all symlink components resolved), using only the shell. Replaces
# `readlink -f`. A missing path prints nothing and returns non-zero, matching the old
# `readlink -f … 2>/dev/null || true` contract at call sites that tolerate empty. A symlink to a
# directory resolves through it (test -d follows symlinks), which is exactly the stable-path case.
resolve_path() {
  local target="$1"
  if [ -d "$target" ]; then
    (cd "$target" 2>/dev/null && pwd -P)
    return
  fi
  if [ -e "$target" ] || [ -L "$target" ]; then
    local directory base
    directory="$(cd "$(dirname "$target")" 2>/dev/null && pwd -P)" || return 1
    base="$(basename "$target")"
    if [ -L "$directory/$base" ]; then
      local link
      link="$(readlink "$directory/$base")"
      case "$link" in
        /*) resolve_path "$link" ;;
        *) resolve_path "$directory/$link" ;;
      esac
    else
      printf '%s\n' "$directory/$base"
    fi
    return
  fi
  return 1
}
