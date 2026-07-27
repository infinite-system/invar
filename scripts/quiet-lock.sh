#!/usr/bin/env bash
# Machine-wide readers-writer scheduling for timing-sensitive Invar work.
#
# invariant: Soft duration reports use a machine-wide quiet lock (scripts/harness/harness.invariants.md)

quiet_lock_script_path="$(
  cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd
)/$(basename "${BASH_SOURCE[0]}")"
quiet_lock_default_file_path="/tmp/invar-quiet.lock"
quiet_lock_default_journal_path="/tmp/invar-quiet-lock.journal"
quiet_lock_default_wait_seconds=120
quiet_lock_journal_line_limit=400
quiet_lock_journal_retained_lines=200

quiet_lock_mode_covers() {
  local held_mode="$1"
  local requested_mode="$2"
  [ "$held_mode" = "quiet-exclusive" ] || {
    [ "$held_mode" = "loud-shared" ] &&
      [ "$requested_mode" = "loud-shared" ]
  }
}

quiet_lock_elapsed_milliseconds() {
  local started_milliseconds="$1"
  local finished_milliseconds="$2"
  printf '%s' "$((finished_milliseconds - started_milliseconds))"
}

quiet_lock_append_journal() {
  local journal_path="$1"
  local event_name="$2"
  local holder_identifier="$3"
  local holder_mode="$4"
  local holder_process_identifier="$5"
  local holder_name="$6"
  local wait_milliseconds="$7"
  local sanitized_holder_name
  local journal_line_count
  local journal_temporary_path
  local journal_guard_file_descriptor

  sanitized_holder_name="$(
    printf '%s' "$holder_name" | tr '\t\r\n' '   '
  )"
  mkdir -p "$(dirname "$journal_path")"
  exec {journal_guard_file_descriptor}>"${journal_path}.guard"
  flock -x "$journal_guard_file_descriptor"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(date -Ins)" \
    "$event_name" \
    "$holder_identifier" \
    "$holder_mode" \
    "$holder_process_identifier" \
    "$sanitized_holder_name" \
    "$wait_milliseconds" >>"$journal_path"
  journal_line_count="$(wc -l <"$journal_path")"
  if [ "$journal_line_count" -gt "$quiet_lock_journal_line_limit" ]; then
    journal_temporary_path="${journal_path}.rotate.${BASHPID}"
    tail -n "$quiet_lock_journal_retained_lines" \
      "$journal_path" >"$journal_temporary_path"
    mv "$journal_temporary_path" "$journal_path"
  fi
  exec {journal_guard_file_descriptor}>&-
}

quiet_lock_current_holder_names() {
  local journal_path="$1"
  [ -f "$journal_path" ] || {
    printf '%s' "unknown holder"
    return
  }
  awk -F '\t' '
    $2 == "acquired" {
      active[$3] = $6 " (pid " $5 ", " $4 ")"
    }
    $2 == "released" {
      delete active[$3]
    }
    END {
      separator = ""
      for (holder_identifier in active) {
        printf "%s%s", separator, active[holder_identifier]
        separator = "; "
      }
      if (separator == "") {
        printf "unknown holder"
      }
    }
  ' "$journal_path"
}

quiet_lock_run_with_paths() {
  local requested_mode="$1"
  local holder_name="$2"
  local maximum_wait_seconds="$3"
  local lock_file_path="$4"
  local journal_path="$5"
  shift 5

  local acquisition_started_milliseconds
  local acquisition_finished_milliseconds
  local acquisition_wait_milliseconds
  local command_exit_code
  local holder_identifier
  local holder_process_identifier
  local lock_file_descriptor
  local lock_option
  local previous_holder_name="${INVAR_QUIET_LOCK_HOLDER_NAME-}"
  local previous_lock_degraded_reason="${INVAR_QUIET_LOCK_DEGRADED_REASON-}"
  local previous_lock_holders="${INVAR_QUIET_LOCK_HOLDERS-}"
  local previous_lock_mode="${INVAR_QUIET_LOCK_MODE-}"
  local previous_lock_state="${INVAR_QUIET_LOCK_STATE-}"
  local previous_lock_wait_milliseconds="${INVAR_QUIET_LOCK_WAIT_MILLISECONDS-}"
  local previous_lock_wait_seconds="${INVAR_QUIET_LOCK_WAIT_SECONDS-}"

  case "$requested_mode" in
    quiet-exclusive) lock_option="-x" ;;
    loud-shared) lock_option="-s" ;;
    *)
      echo "quiet-lock: invalid mode '$requested_mode'" >&2
      return 2
      ;;
  esac
  [ "$#" -gt 0 ] || {
    echo "quiet-lock: no command supplied" >&2
    return 2
  }

  if [ "${INVAR_QUIET_LOCK:-1}" = "0" ]; then
    "$@"
    return $?
  fi
  if quiet_lock_mode_covers \
    "${INVAR_QUIET_LOCK_MODE:-}" \
    "$requested_mode"; then
    "$@"
    return $?
  fi

  holder_process_identifier="$BASHPID"
  holder_identifier="$(
    printf '%s-%s-%s' \
      "$holder_process_identifier" \
      "$(date +%s%N)" \
      "$RANDOM"
  )"
  acquisition_started_milliseconds="$(date +%s%3N)"
  quiet_lock_append_journal \
    "$journal_path" \
    "waiting" \
    "$holder_identifier" \
    "$requested_mode" \
    "$holder_process_identifier" \
    "$holder_name" \
    "0"

  if ! command -v flock >/dev/null 2>&1; then
    echo "QUIET-LOCK WARNING: flock is unavailable; '$holder_name' is" \
      "proceeding without machine-wide scheduling." >&2
    export INVAR_QUIET_LOCK_MODE="$requested_mode"
    export INVAR_QUIET_LOCK_HOLDER_NAME="$holder_name"
    export INVAR_QUIET_LOCK_STATE="degraded"
    export INVAR_QUIET_LOCK_DEGRADED_REASON="flock-unavailable"
    export INVAR_QUIET_LOCK_WAIT_SECONDS="0"
    export INVAR_QUIET_LOCK_WAIT_MILLISECONDS="0"
    export INVAR_QUIET_LOCK_HOLDERS="flock unavailable"
    quiet_lock_append_journal \
      "$journal_path" \
      "degraded" \
      "$holder_identifier" \
      "$requested_mode" \
      "$holder_process_identifier" \
      "$holder_name" \
      "0"
    "$@"
    command_exit_code=$?
  else
    exec {lock_file_descriptor}>"$lock_file_path"
    if flock \
      "$lock_option" \
      -w "$maximum_wait_seconds" \
      "$lock_file_descriptor"; then
      acquisition_finished_milliseconds="$(date +%s%3N)"
      acquisition_wait_milliseconds="$(
        quiet_lock_elapsed_milliseconds \
          "$acquisition_started_milliseconds" \
          "$acquisition_finished_milliseconds"
      )"
      export INVAR_QUIET_LOCK_MODE="$requested_mode"
      export INVAR_QUIET_LOCK_HOLDER_NAME="$holder_name"
      export INVAR_QUIET_LOCK_STATE="acquired"
      unset INVAR_QUIET_LOCK_DEGRADED_REASON
      unset INVAR_QUIET_LOCK_WAIT_SECONDS
      unset INVAR_QUIET_LOCK_WAIT_MILLISECONDS
      unset INVAR_QUIET_LOCK_HOLDERS
      quiet_lock_append_journal \
        "$journal_path" \
        "acquired" \
        "$holder_identifier" \
        "$requested_mode" \
        "$holder_process_identifier" \
        "$holder_name" \
        "$acquisition_wait_milliseconds"
      "$@"
      command_exit_code=$?
      quiet_lock_append_journal \
        "$journal_path" \
        "released" \
        "$holder_identifier" \
        "$requested_mode" \
        "$holder_process_identifier" \
        "$holder_name" \
        "$acquisition_wait_milliseconds"
      exec {lock_file_descriptor}>&-
    else
      acquisition_finished_milliseconds="$(date +%s%3N)"
      acquisition_wait_milliseconds="$(
        quiet_lock_elapsed_milliseconds \
          "$acquisition_started_milliseconds" \
          "$acquisition_finished_milliseconds"
      )"
      local current_holder_names
      current_holder_names="$(
        quiet_lock_current_holder_names "$journal_path"
      )"
      echo "QUIET-LOCK WARNING: '$holder_name' waited" \
        "${acquisition_wait_milliseconds} ms for $requested_mode; holders:" \
        "${current_holder_names}." \
        "Proceeding unlocked so scheduling cannot wedge the machine." >&2
      export INVAR_QUIET_LOCK_MODE="$requested_mode"
      export INVAR_QUIET_LOCK_HOLDER_NAME="$holder_name"
      export INVAR_QUIET_LOCK_STATE="degraded"
      export INVAR_QUIET_LOCK_DEGRADED_REASON="timeout"
      export INVAR_QUIET_LOCK_WAIT_SECONDS="$maximum_wait_seconds"
      export INVAR_QUIET_LOCK_WAIT_MILLISECONDS="$acquisition_wait_milliseconds"
      export INVAR_QUIET_LOCK_HOLDERS="$current_holder_names"
      quiet_lock_append_journal \
        "$journal_path" \
        "degraded" \
        "$holder_identifier" \
        "$requested_mode" \
        "$holder_process_identifier" \
        "$holder_name" \
        "$acquisition_wait_milliseconds"
      exec {lock_file_descriptor}>&-
      "$@"
      command_exit_code=$?
    fi
  fi

  if [ -n "$previous_lock_mode" ]; then
    export INVAR_QUIET_LOCK_MODE="$previous_lock_mode"
  else
    unset INVAR_QUIET_LOCK_MODE
  fi
  if [ -n "$previous_holder_name" ]; then
    export INVAR_QUIET_LOCK_HOLDER_NAME="$previous_holder_name"
  else
    unset INVAR_QUIET_LOCK_HOLDER_NAME
  fi
  if [ -n "$previous_lock_state" ]; then
    export INVAR_QUIET_LOCK_STATE="$previous_lock_state"
  else
    unset INVAR_QUIET_LOCK_STATE
  fi
  if [ -n "$previous_lock_degraded_reason" ]; then
    export INVAR_QUIET_LOCK_DEGRADED_REASON="$previous_lock_degraded_reason"
  else
    unset INVAR_QUIET_LOCK_DEGRADED_REASON
  fi
  if [ -n "$previous_lock_wait_seconds" ]; then
    export INVAR_QUIET_LOCK_WAIT_SECONDS="$previous_lock_wait_seconds"
  else
    unset INVAR_QUIET_LOCK_WAIT_SECONDS
  fi
  if [ -n "$previous_lock_wait_milliseconds" ]; then
    export INVAR_QUIET_LOCK_WAIT_MILLISECONDS="$previous_lock_wait_milliseconds"
  else
    unset INVAR_QUIET_LOCK_WAIT_MILLISECONDS
  fi
  if [ -n "$previous_lock_holders" ]; then
    export INVAR_QUIET_LOCK_HOLDERS="$previous_lock_holders"
  else
    unset INVAR_QUIET_LOCK_HOLDERS
  fi
  return "$command_exit_code"
}

quiet_lock_run() {
  local requested_mode="$1"
  local holder_name="$2"
  shift 2
  quiet_lock_run_with_paths \
    "$requested_mode" \
    "$holder_name" \
    "$quiet_lock_default_wait_seconds" \
    "$quiet_lock_default_file_path" \
    "$quiet_lock_default_journal_path" \
    "$@"
}

quiet_lock_rerun_script() {
  local requested_mode="$1"
  local holder_name="$2"
  local entry_point_path="$3"
  shift 3

  if [ "${INVAR_QUIET_LOCK:-1}" = "0" ] ||
    quiet_lock_mode_covers \
      "${INVAR_QUIET_LOCK_MODE:-}" \
      "$requested_mode"; then
    return
  fi
  exec bash \
    "$quiet_lock_script_path" \
    "$requested_mode" \
    "$holder_name" \
    bash \
    "$entry_point_path" \
    "$@"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  [ "$#" -ge 3 ] || {
    echo "usage: $0 quiet-exclusive|loud-shared HOLDER COMMAND [ARG ...]" >&2
    exit 2
  }
  quiet_lock_requested_mode="$1"
  quiet_lock_holder_name="$2"
  shift 2
  quiet_lock_run \
    "$quiet_lock_requested_mode" \
    "$quiet_lock_holder_name" \
    "$@"
  exit $?
fi
