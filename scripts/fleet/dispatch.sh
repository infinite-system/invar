#!/usr/bin/env bash
# Dispatch a builder, and make its record a BYPRODUCT of dispatching.
#
# WHY THIS EXISTS
#
# Seven bycatch findings were reported correctly by builders on 2026-07-27 and
# five were lost, for exactly one reason: recording them required a SEPARATE
# ACTION from the work that produced them. Any record that depends on a second
# step eventually does not happen. Every brief written by hand had the same
# latent defect — it survived only because someone chose to keep a copy, and
# nothing would have noticed if they had not.
#
# So this script REFUSES TO LAUNCH AN AGENT WITHOUT COMMITTING ITS BRIEF FIRST.
# That single ordering is the whole design; everything else here is convenience.
#
# Usage:
#   scripts/fleet/dispatch.sh <task-number> <slug> <brief-file> [engine]
#
#   scripts/fleet/dispatch.sh 168 frame-ordinal-wait /tmp/brief.md
#   scripts/fleet/dispatch.sh 171 tasks-json-displaces-builtin /tmp/brief.md claude
#
# engine defaults to codex.

set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <task-number> <slug> <brief-file> [engine]" >&2
  exit 2
fi

task_number="$1"
slug="$2"
brief_file="$3"
engine="${4:-codex}"

case "$task_number" in
  ''|*[!0-9]*) echo "dispatch: task number must be digits, got '$task_number'" >&2; exit 2;;
esac
case "$slug" in
  ''|*[!a-z0-9-]*) echo "dispatch: slug must be lowercase letters, digits, hyphens" >&2; exit 2;;
esac
[ -f "$brief_file" ] || { echo "dispatch: brief not found: $brief_file" >&2; exit 2; }
name="${task_number}-${slug}"
script_repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
brief_link_directory="${script_repository_root}/.invar/tasks/in-progress/${name}"
for task_state in active in-progress completed retired; do
  task_record_directory="${script_repository_root}/.invar/tasks/${task_state}/${name}"
  if [ -d "$task_record_directory" ]; then
    brief_link_directory="$task_record_directory"
    break
  fi
done

# THE INVARIANT DIALOGUE IS MECHANICAL. A brief without its two sections does
# not launch — the loop cannot depend on the conductor remembering it.
#   ## Invariants in scope   — enumerated records, or the explicit word "none"
#   ## Bycatch expected      — the standing order restated, with the taxonomy pointer
# Its relative document links must resolve, and bare document references are
# not records a reader can open.
if ! grep -q "^## Invariants in scope" "$brief_file"; then
  echo "dispatch: REFUSING — the brief has no '## Invariants in scope' section." >&2
  echo "  Enumerate the records this task implicates (name, path, why), or write 'none'." >&2
  exit 2
fi
if ! grep -q "^## Bycatch expected" "$brief_file"; then
  echo "dispatch: REFUSING — the brief has no '## Bycatch expected' section." >&2
  echo "  Restate the standing order with the AGENTS.md taxonomy pointer; the READY report" >&2
  echo "  must carry '## Bycatch' even when it reads 'None observed'." >&2
  exit 2
fi
if ! PATH="$HOME/.bun/bin:$PATH" bun "${script_repository_root}/scripts/tasks/lint-task-links.ts" \
     --base-directory "$brief_link_directory" "$brief_file"; then
  echo "dispatch: REFUSING — the brief has dead or bare document references." >&2
  echo "  Fix them, or run: bun scripts/tasks/lint-task-links.ts --fix --base-directory ${brief_link_directory} ${brief_file}" >&2
  exit 2
fi

# SNAPSHOT the brief NOW. A pre-filed brief naturally lives INSIDE the active/
# task folder, and the record move (active/ -> in-progress/) below relocates
# that folder BEFORE the brief is copied into the worktree — the cp then reads
# a path that no longer exists (bit twice on 2026-07-29, #268). The snapshot
# makes the brief's location irrelevant to everything after this line.
brief_snapshot="$(mktemp)"
cp "$brief_file" "$brief_snapshot"
brief_file="$brief_snapshot"
# Cleaned by cleanup_ledger_worktree's EXIT trap below (one trap, one owner —
# a second `trap ... EXIT` here would be silently replaced by that one).

# A BUILDER NEVER RUNS UNWATCHED. fleet-watch stamps /tmp/fleet-watch.heartbeat
# every cycle; a stale stamp means no sentinel is watching for READY, death, OR
# file sprawl (the #244 night: 131 x 200MB extractions per gate, disk to 100%
# twice before any lens showed it). Arming is one idempotent action — the watcher
# derives its whole watch set from disk, so re-arming never duplicates anything.
if [ "${SENTINEL_ACK:-0}" != "1" ]; then
  if [ -z "$(find /tmp/fleet-watch.heartbeat -mmin -3 2>/dev/null)" ]; then
    echo "dispatch: REFUSING — fleet-watch heartbeat is missing or stale (>3m)." >&2
    echo "  Arm the ONE watcher (idempotent):" >&2
    echo "    Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)" >&2
    echo "  Deliberate exception only: SENTINEL_ACK=1" >&2
    exit 2
  fi
fi

# VALIDATE EVERY ARGUMENT BEFORE ANY SIDE EFFECT. The first version of this
# script checked the engine name at launch time — step 5 — so a typo'd engine
# had already cut a worktree, run `bun install`, and COMMITTED A BRIEF for a
# dispatch that then refused to start. Validate-late/act-early is the same
# ordering defect that made a worktree prune delete tracked files before the
# removal it was preparing for could run. Guards go first or they are not guards.
case "$engine" in
  codex|claude) ;;
  *) echo "dispatch: unknown engine '$engine' (codex|claude)" >&2; exit 2;;
esac

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

# A pathspec commit is impossible mid-merge, and a dispatch mid-merge is a
# mistake anyway. Refuse before any side effect.
if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  echo "dispatch: REFUSING — the repository is mid-merge; finish or abort the merge first." >&2
  exit 2
fi

# EXPERIMENT=1 marks work that is HELD FROM MAIN pending proof — the branch name carries the policy
# so nobody has to remember it. `land.sh` refuses to merge an `experiment/` branch without an
# explicit ADOPT_EXPERIMENT=1, which turns "provenance decides main, not quality" from a rule the
# conductor recalls into one the tooling enforces. #169 is the founding case: an outside review found
# a real structural fact (four arrays of length n per edit) that has never been shown to be a felt
# problem, so the change must prove it is an invariant unlock before it is adopted at all.
if [ "${EXPERIMENT:-0}" = "1" ]; then
  branch="experiment/${name}"
else
  branch="fleet/${name}"
fi
worktree_path="${repository_root}/.invar/worktrees/${name}"
# THE TASK FOLDER IS THE RECORD, and a dispatched task is IN-PROGRESS by definition. `.invar/tasks/` replaced
# `agent-dispatches/` on 2026-07-28: the old layout kept one brief per task, so a follow-up brief either
# overwrote its predecessor or lived only in a tmux session, and steering that overwrites its
# predecessor destroys the record of what the agent was working from when it made a decision. Briefs are
# now numbered and dated, never edited. The conductor moves the folder between active/in-progress/completed/retired.
#
# A SLUG MUST BE DESCRIPTIVE — three words minimum. `fold-flyweight` required opening the brief to learn
# what it meant; `folded-editing-scale-invariance` does not. A folder name is read far more often than
# it is typed.
slug_word_count="$(printf '%s' "$slug" | tr '-' '\n' | grep -c .)"
if [ "$slug_word_count" -lt 3 ]; then
  echo "dispatch: REFUSING — slug '$slug' has $slug_word_count word(s); 3 minimum." >&2
  echo "  A folder name is read far more often than it is typed. Say what the task IS:" >&2
  echo "  not 'fold-flyweight' but 'folded-editing-scale-invariance'." >&2
  exit 2
fi
tmux_session="invar/${name}"

# ---------------------------------------------------------------------------
# THE ASSIGNMENT IS THE TASK FILE'S, NOT THE COMMAND LINE'S.
#
# Every task declares Engine / Environment / Model / Effort. Reading them here rather than accepting
# them as arguments means the dispatch cannot disagree with the record: if a task says it needs a
# claude on macOS, no amount of typing `codex` at the prompt makes that true.
#
# The environment check is the load-bearing one. #180's work CANNOT run on this host — PtyTestDriver
# is FFI-blocked on darwin, so the gate has never run on the user's machine — and before the field
# existed that task read as ordinary backlog. A dispatch here would have cut a worktree, installed
# dependencies, and launched an agent that could not run a single smoke.
# ---------------------------------------------------------------------------
# `|| true`: with pipefail, a no-match ls fails the assignment and set -e kills the
# script SILENTLY with exit 2. A dispatch without a pre-filed task file must proceed
# to the guards, not die mute. Caught by a DRY_RUN whose task number had no folder.
task_file="$(ls "${repository_root}"/.invar/tasks/*/"${name}"/task-"${name}".md 2>/dev/null | head -1 || true)"
if [ -n "$task_file" ]; then
  # `|| true`: a missing field must yield empty, not kill the script — under
  # pipefail a no-match grep fails the whole substitution and set -e exits 1
  # with NO output. Fourth member of the silent-death class tonight; the
  # fleet defaults below are exactly for absent fields, so absence is legal.
  read_field() { { grep -m1 "^$1:" "$task_file" || true; } | sed "s/^$1:[[:space:]]*//" | tr -d '\r'; }
  declared_engine="$(read_field Engine)"
  declared_environment="$(read_field Environment)"
  declared_model="$(read_field Model)"
  declared_effort="$(read_field Effort)"

  host_environment="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$host_environment" in darwin) host_environment=macos;; esac
  if [ -n "$declared_environment" ] && [ "$declared_environment" != "any" ] &&
     [ "$declared_environment" != "$host_environment" ]; then
    echo "dispatch: REFUSING — #${task_number} declares Environment: ${declared_environment}, this host is ${host_environment}." >&2
    echo "  $(grep -m1 '^Assignment note:' "$task_file" 2>/dev/null || echo '  The task cannot run here.')" >&2
    exit 2
  fi

  if [ -n "$declared_engine" ] && [ "$declared_engine" = "user" ]; then
    echo "dispatch: REFUSING — #${task_number} declares Engine: user. It is a decision, not a build." >&2
    exit 2
  fi
  if [ -n "$declared_engine" ] && [ "$declared_engine" != "$engine" ]; then
    echo "dispatch: REFUSING — #${task_number} declares Engine: ${declared_engine}, you asked for ${engine}." >&2
    echo "  Change the task file if the assignment is wrong; do not override it at the prompt." >&2
    exit 2
  fi
fi
# The agent identity, for the transcript name: engine + model + effort. Three runs of one task by
# three different agents produce three distinguishable transcripts instead of one overwritten file.
# Resolve model/effort DEFAULTS per engine before anything records them: a
# record with no Model: line means the fleet default for its engine, never
# "unknown". Codex effort policy: medium is NOT allowed (user directive
# 2026-07-29) — normalize medium->high loudly; empty/default -> high.
resolved_engine="${declared_engine:-$engine}"
if [ "$resolved_engine" = "codex" ]; then
  declared_model="${declared_model:-5.6-sol}"
  case "${declared_effort:-}" in
    ""|default) declared_effort="high";;
    medium) echo "dispatch: WARNING — codex effort 'medium' is not allowed; using 'high'" >&2; declared_effort="high";;
  esac
else
  declared_model="${declared_model:-fable-5}"
  declared_effort="${declared_effort:-default}"
fi
agent_identity="${resolved_engine}-${declared_model}-${declared_effort}"

# Transcripts live with the other 171 in tmp/transcripts/ (gitignored; the user's decision on
# 2026-07-27 was "no need to store in git history"). NOT beside the worktree dirs: .invar/worktrees/
# gets pruned on landing, and co-mingling durable records with prunable scratch is what put 1.1 GB of
# logs one reboot from gone in the first place.
transcript_path="${repository_root}/tmp/transcripts/transcript-${agent_identity}-${name}.md"

# ---------------------------------------------------------------------------
# DRY_RUN=1 stops HERE — after every guard, before the first side effect.
#
# This exists because of a specific mistake. Three refusal guards were verified by running them and
# watching them refuse. The fourth check was meant to be the negative control — proof that the guard
# does not simply refuse everything — and it was run the same way. But this script is not a query:
# "did not refuse" meant it CUT A WORKTREE, committed a brief reading "brief", and launched a codex
# on a task nobody had asked for.
#
# A control that mutates the system is not a control. The negative arm of any guard test needs a way
# to reach the guard without paying for the action, and now there is one:
#
#   DRY_RUN=1 scripts/fleet/dispatch.sh 199 find-reveal-blank-target-line /tmp/brief.md codex
# ---------------------------------------------------------------------------
if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "dispatch: DRY RUN — every guard passed, no side effect taken."
  echo "  task:        #${task_number} ${slug}"
  echo "  engine:      ${declared_engine:-$engine}   model: ${declared_model:-fleet-default}   effort: ${declared_effort:-fleet-default}"
  echo "               (fleet defaults at launch: codex -> gpt-5.6-sol high; claude -> fable medium)"
  echo "  environment: ${declared_environment:-unset} (host: $(uname -s | tr '[:upper:]' '[:lower:]'))"
  echo "  branch:      ${branch}"
  echo "  worktree:    ${worktree_path}"
  echo "  transcript:  ${transcript_path}"
  exit 0
fi

# ---------------------------------------------------------------------------
# THE TASK RECORD LANDS ON MAIN, whatever branch is checked out here.
#
# The record is main-line ledger state. Committing it to whichever branch
# happens to be checked out strands it there, and main's task list silently
# lies. Two arms, chosen by where HEAD is:
#   - HEAD is main: record in this checkout (the normal case).
#   - HEAD is elsewhere: main is by definition not checked out here, so borrow
#     it into a temporary worktree, record there, remove the worktree.
# If main cannot be borrowed (checked out in some other worktree), REFUSE —
# a wrong-branch ledger commit is silent drift; a refused dispatch is visible.
# ---------------------------------------------------------------------------
ledger_root="$repository_root"
ledger_worktree_temporary=""
# Compare the BRANCH NAME, not the commit: a branch freshly cut from main has
# main's exact commit, and a commit-equality check then records onto the branch.
# The throwaway-clone test caught that on its first run. Detached HEAD (empty
# name) is also not main.
checked_out_branch="$(git symbolic-ref --quiet --short HEAD || true)"
if [ "$checked_out_branch" != "main" ]; then
  ledger_worktree_temporary="$(mktemp -d /tmp/dispatch-ledger-XXXXXX)"
  if ! git worktree add --quiet "$ledger_worktree_temporary" main 2>/dev/null; then
    echo "dispatch: REFUSING — checkout is on '$(git branch --show-current)' and main cannot be borrowed into a temporary worktree." >&2
    echo "  The task record must land on main, never on the checked-out branch. Another worktree may hold main:" >&2
    git worktree list >&2
    rmdir "$ledger_worktree_temporary" 2>/dev/null || true
    exit 2
  fi
  ledger_root="$ledger_worktree_temporary"
  echo "dispatch: ledger — recording on main via temporary worktree (checkout is on $(git branch --show-current))"
fi
cleanup_ledger_worktree() {
  rm -f "${brief_snapshot:-}"
  if [ -n "$ledger_worktree_temporary" ]; then
    git worktree remove "$ledger_worktree_temporary" 2>/dev/null \
      || echo "dispatch: WARNING — temporary ledger worktree left at $ledger_worktree_temporary for inspection" >&2
  fi
}
trap cleanup_ledger_worktree EXIT
dispatch_directory="${ledger_root}/.invar/tasks/in-progress/${name}"

# ---------------------------------------------------------------------------
# 1. REFUSE on any collision. A leftover worktree has silently started a builder
#    on the WRONG BASE three separate times; picking a new path costs nothing and
#    reusing one costs a whole run.
# ---------------------------------------------------------------------------
[ -e "$worktree_path" ] && { echo "dispatch: worktree path occupied: $worktree_path" >&2; exit 1; }
[ -e "$dispatch_directory" ] && { echo "dispatch: dispatch record exists: $dispatch_directory" >&2; exit 1; }
if git show-ref --verify --quiet "refs/heads/${branch}"; then
  echo "dispatch: branch already exists: $branch" >&2; exit 1
fi
if tmux has-session -t "$tmux_session" 2>/dev/null; then
  echo "dispatch: tmux session already live: $tmux_session" >&2; exit 1
fi

# ---------------------------------------------------------------------------
# 2. Cut the worktree, then INSTALL DEPENDENCIES.
#    `git worktree add` copies tracked files only, so a fresh worktree has no
#    node_modules. The resulting preflight red is clean, consistent and
#    meaningless — and looks exactly like the defect the builder was sent to
#    investigate. That cost one builder ten baseline runs on 2026-07-27.
# ---------------------------------------------------------------------------
# THE BASE MUST BE CONSCIOUS. This line read `... "$worktree_path" main` — hardcoded, silent, and
# ignoring the conductor's own HEAD. On 2026-07-28 a task whose brief said in so many words "you are
# branching off the flyweight work, not off main" was cut from main anyway, WITHOUT the block tier the
# task existed to extend. The builder noticed the mismatch and fast-forwarded itself; had it not, it
# would have spent its whole run measuring an editor that could not exhibit the defect, and the
# conductor had already told the user the base was correct.
#
# Defaulting to HEAD instead would be the opposite failure: builders would silently chain onto
# unlanded work, and "experiments fork off LATEST main" would quietly stop being true. Neither
# default is safe, so there is no default when the two disagree — dispatch REFUSES and makes the
# caller name the base. Override with BASE_REF.
base_ref="${BASE_REF:-}"
if [ -z "$base_ref" ]; then
  conductor_head="$(git rev-parse --verify HEAD)"
  main_head="$(git rev-parse --verify main)"
  if [ "$conductor_head" = "$main_head" ]; then
    base_ref=main
  else
    echo "dispatch: REFUSING — the conductor's checkout is not on main, so the intended base is ambiguous." >&2
    echo "  conductor HEAD : $(git rev-parse --short HEAD) ($(git branch --show-current))" >&2
    echo "  main           : $(git rev-parse --short main)" >&2
    echo "  Name it explicitly, e.g.  BASE_REF=HEAD $0 $*   (build on the current branch)" >&2
    echo "                       or   BASE_REF=main $0 $*   (fork off main, the default for experiments)" >&2
    exit 2
  fi
fi
base_commit="$(git rev-parse --short "$base_ref")"
echo "dispatch: cutting worktree $worktree_path on $branch"
echo "dispatch: BASE = $base_ref ($base_commit)"
# ---------------------------------------------------------------------------
# 3. Place the brief in BOTH homes: the worktree (for the builder) and the
#    dispatch record (for the audit trail).
# ---------------------------------------------------------------------------
# A pre-filed task MOVES from active/ — one task, one folder, forever. mkdir alone would leave the
# active copy behind and the first dispatch of a filed task would duplicate it. The State line
# follows the folder so STATE-MISMATCH stays quiet on a healthy dispatch.
if [ -d "${ledger_root}/.invar/tasks/active/${name}" ]; then
  git -C "$ledger_root" mv ".invar/tasks/active/${name}" ".invar/tasks/in-progress/${name}"
  sed -i '0,/^State: .*/s//State: IN-PROGRESS/' "$dispatch_directory/task-${name}.md" 2>/dev/null || true
fi
mkdir -p "$dispatch_directory" "$(dirname "$transcript_path")"
# Brief naming is brief-<task-number>-<sequence>-<slug>.md — the NUMBER leads, so every file in the
# folder sorts under its task and a directory listing groups by task before it groups by round. The
# sequence is the next unused one, so a follow-up brief is a NEW file and never overwrites the brief
# the builder was actually working from.
brief_sequence=1
while [ -e "$dispatch_directory/brief-${task_number}-${brief_sequence}-${slug}.md" ]; do
  brief_sequence=$((brief_sequence + 1))
done
brief_dated_name="brief-${task_number}-${brief_sequence}-${slug}.md"
cp "$brief_file" "$dispatch_directory/$brief_dated_name"
# land.sh REQUIRES task-<name>.md in the dispatch folder (it rewrites the State
# line at landing). A bundle or renamed-slug dispatch has no matching active/
# record to move, so WRITE A STUB now — landing #313 and #312 both stalled on
# this exact absence (2026-07-29).
if [ ! -f "$dispatch_directory/task-${name}.md" ]; then
  cat > "$dispatch_directory/task-${name}.md" <<STUB
# ${task_number} — dispatch record: ${slug}

State: active
Engine: ${resolved_engine}
Model: ${declared_model}
Effort: ${declared_effort}

Dispatch-generated stub (no matching active/ record folder for this
slug — bundle or renamed dispatch). The governing task records are the
ones linked from [the brief](${brief_dated_name}); the conductor
completes those records at landing.
STUB
fi
PATH="$HOME/.bun/bin:$PATH" bun "${repository_root}/scripts/tasks/lint-task-links.ts" \
  --fix --moved-only "$dispatch_directory/$brief_dated_name"

# meta.json is written BEFORE the commit so it lands WITH the brief. Written afterwards it stayed
# untracked and never became part of the audit record — the same "a record that needs a second step
# eventually does not happen" defect this whole script exists to remove, reintroduced inside it.
# baseCommit is therefore the commit the worktree was CUT FROM, which is the more useful fact anyway.
cat > "$dispatch_directory/meta.json" <<META
{
  "task": ${task_number},
  "slug": "${slug}",
  "branch": "${branch}",
  "worktree": ".invar/worktrees/${name}",
  "tmuxSession": "${tmux_session}",
  "transcript": "tmp/transcripts/transcript-${agent_identity}-${name}.md",
  "engine": "${declared_engine:-$engine}",
  "environment": "${declared_environment:-linux}",
  "model": "${declared_model:-unknown}",
  "effort": "${declared_effort:-default}",
  "heldFromMain": $([ "${EXPERIMENT:-0}" = "1" ] && echo true || echo false),
  "baseCommit": "$(git rev-parse "$base_ref")",
  "startedAt": "$(date -Is)"
}
META

# ---------------------------------------------------------------------------
# 4. COMMIT THE WHOLE RECORD BEFORE LAUNCHING. This is the step the whole
#    script exists for. If it fails, no agent starts — an unrecorded dispatch
#    is worse than no dispatch, because it produces work nobody can audit.
#
#    The commit is PATHSPEC-LIMITED to the task tree and its generated views:
#    it records exactly those paths and ignores everything else in the
#    checkout, staged or not. This closed a real gap — the first version named
#    only the brief and meta.json, so the active/ -> in-progress/ move stayed
#    staged and uncommitted, and the next merge tripped over it.
#
#    write-active runs FIRST and in the ledger root, so the regenerated views
#    ride the same commit as the move they reflect.
#    SKIP_GATE: markdown only, and the gate is for landing, not dispatching.
# ---------------------------------------------------------------------------
(cd "$ledger_root" && PATH="$HOME/.bun/bin:$PATH" bun "scripts/tasks/tasks-status.ts" write-active >/dev/null 2>&1) \
  || echo "dispatch: WARNING — write-active failed; generated views may lag this dispatch" >&2
git -C "$ledger_root" add -A -- .invar/tasks project.active-tasks.md project.tasks-completed.md
if ! SKIP_GATE=1 git -C "$ledger_root" -c commit.gpgsign=false commit -q \
      -m "dispatch #${task_number}: ${slug}

Brief, task move, and regenerated views committed before the agent starts, so
the record cannot drift from what was actually asked. Branch ${branch},
worktree .invar/worktrees/${name}, session ${tmux_session}, engine ${engine}." \
      -- .invar/tasks project.active-tasks.md project.tasks-completed.md; then
  echo "dispatch: RECORD COMMIT FAILED — refusing to launch. Uncommitted record state:" >&2
  git -C "$ledger_root" status --porcelain -- .invar/tasks project.active-tasks.md project.tasks-completed.md >&2
  exit 1
fi

# RECORD_ONLY=1 stops here — record committed, no agent. This is the testable
# seam for both ledger arms (on-main and borrowed-main) in a throwaway clone,
# without launching tmux or an agent. It is not for production dispatches.
if [ "${RECORD_ONLY:-0}" = "1" ]; then
  echo "dispatch: RECORD_ONLY — record committed on main, no agent launched."
  exit 0
fi

# ---------------------------------------------------------------------------
# 4b. CUT THE WORKTREE FROM THE RECORD COMMIT. The record (active/ ->
#     in-progress/ move, brief, meta) is already committed, so the builder's
#     tree is BORN seeing in-progress/<name>/ — a builder filing scratches
#     into its own task folder at the pre-dispatch active/ path was the whole
#     conflict class land.sh's rename-follow arm exists for (2026-07-29,
#     user-directed reorder). base_ref/base_commit above remain the CONTENT
#     base recorded in meta.json; the actual cut point is that base plus the
#     record commit, verified to differ only in .invar/tasks and views.
# ---------------------------------------------------------------------------
cut_ref="$base_ref"
if [ "$base_ref" = "main" ]; then
  cut_ref="main"
  non_record_drift="$(git diff --name-only "$base_commit" main -- . ':(exclude).invar/tasks' ':(exclude)project.active-tasks.md' ':(exclude)project.tasks-completed.md')"
  if [ -n "$non_record_drift" ]; then
    echo "dispatch: REFUSING — main moved beyond the record between base resolution and cut:" >&2
    printf '%s\n' "$non_record_drift" >&2
    exit 1
  fi
fi
git worktree add -b "$branch" "$worktree_path" "$cut_ref" >/dev/null
worktree_head="$(git -C "$worktree_path" rev-parse --short HEAD)"
echo "dispatch: worktree cut at $worktree_head (content base $base_commit + the record commit)"
[ -d "$worktree_path/.invar/tasks/in-progress/${name}" ] \
  || { echo "dispatch: worktree does not see its own in-progress record — refusing" >&2; exit 1; }

echo "dispatch: installing dependencies (not optional, not the builder's job to discover)"
( cd "$worktree_path" && PATH="$HOME/.bun/bin:$PATH" bun install >/dev/null 2>&1 ) \
  || { echo "dispatch: bun install FAILED — not launching" >&2; exit 1; }

cp "$brief_snapshot" "$worktree_path/TASK.md"

# ---------------------------------------------------------------------------
# 5. Launch inside tmux so the session is ATTACHABLE BY SOMEONE WHO IS NOT THE
#    DISPATCHER. A named session also gives precise identity for termination —
#    `pkill -f` matches the builder's own brief text, and a kill is destructive.
# ---------------------------------------------------------------------------
# INTERACTIVE, not `exec`. `codex exec` / `claude -p` are one-shot with NO input loop, which
# cost real time on 2026-07-28: three brief amendments were appended to TASK.md and sent with
# tmux send-keys, and NONE reached the builder — there was nothing listening. Worse, `pipe-pane`
# captures our own echoed keystrokes, so grepping the transcript for the message "confirmed"
# delivery that never happened. Interactive also means the USER can attach and steer, which is
# the whole point of dispatching into tmux rather than backgrounding a process.
#
# Driving is delegated to .claude/skills/agent-tmux/scripts/agent-tmux.sh (see .claude/skills/agent-tmux/SKILL.md) — do
# NOT hand-roll send-keys here or in any caller. Its `send` verb splits text from Enter and then
# CONFIRMS submission by polling the busy marker; a bare send-keys leaves a large paste sitting
# unsubmitted in the composer, which is exactly what happened.
# THE ASSIGNMENT IS TRANSMITTED, NOT ONLY ENFORCED. The Model/Effort fields
# were checked at dispatch but never passed to the engine, so every claude
# builder ran at its default (medium) while the task file said high — caught
# by the user reading a tmux footer against the tasks:live lens on 2026-07-29.
# Model aliases verified live: opus-5 -> opus, fable-5 -> fable (the -5 forms
# are not valid CLI aliases); codex 5.6-sol -> gpt-5.6-sol (matches the footer
# of every codex session tonight). Effort: claude --effort <level>; codex
# -c model_reasoning_effort=<level>; 'default' means say nothing.
# FLEET DEFAULTS (user policy 2026-07-29), applied when the task file is
# silent; an explicit field ALWAYS wins, including one-off overrides like
# "sol medium" or "sonnet" written into the task file:
#   codex          -> gpt-5.6-sol at HIGH, always
#   claude general -> fable at MEDIUM (high only for complex work, by explicit
#                     assignment with the reason in Assignment note)
#   opus           -> MEDIUM, always, unless the user says otherwise
model_flags=""
case "$engine" in
  codex)
    agent_command="codex --dangerously-bypass-approvals-and-sandbox"
    case "${declared_model:-}" in
      5.6-sol|"") model_flags=" -m gpt-5.6-sol";;
      *) model_flags=" -m ${declared_model}";;
    esac
    effective_effort="${declared_effort:-high}"
    [ "$effective_effort" = "default" ] && effective_effort="high"
    model_flags="${model_flags} -c model_reasoning_effort=${effective_effort}"
    ;;
  claude)
    agent_command="claude --dangerously-skip-permissions"
    case "${declared_model:-}" in
      opus-5)     model_flags=" --model opus";;
      fable-5|"") model_flags=" --model fable";;
      *) model_flags=" --model ${declared_model}";;
    esac
    effective_effort="${declared_effort:-medium}"
    [ "$effective_effort" = "default" ] && effective_effort="medium"
    model_flags="${model_flags} --effort ${effective_effort}"
    ;;
esac
agent_command="${agent_command}${model_flags}"

# A marker taken BEFORE launch makes the native-session link deterministic:
# the engine's store file created after this instant belongs to this launch.
native_session_marker="$(mktemp /tmp/dispatch-session-marker-XXXXXX)"
case "$engine" in
  codex)  native_session_store="$HOME/.codex/sessions";;
  claude) native_session_store="$HOME/.claude/projects";;
esac

AGENT_TMUX_PREFIX="invar/" bash "${repository_root}/.claude/skills/agent-tmux/scripts/agent-tmux.sh" launch "$name" \
  --cwd "$worktree_path" --profile "$engine" --timeout 90 \
  -- env PATH="$HOME/.bun/bin:$PATH" $agent_command >/dev/null || {
    echo "dispatch: agent-tmux launch failed for ${name}" >&2; exit 1; }
tmux pipe-pane -t "$tmux_session" -o "cat >> '${transcript_path}'"
# The pipe has to prove it captures: a failed pipe-pane leaves no transcript and
# nothing else notices for 20 minutes. The agent's boot output arrives within
# seconds, so an empty file after the wait is a loud failure, not a maybe.
transcript_deadline=$((SECONDS + 15))
until [ -s "$transcript_path" ] || [ "$SECONDS" -ge "$transcript_deadline" ]; do
  sleep 1
done
if [ ! -s "$transcript_path" ]; then
  echo "dispatch: WARNING — transcript pipe captured nothing in 15s (${transcript_path});" >&2
  echo "          the builder is running but UNRECORDED. Re-arm with:" >&2
  echo "          tmux pipe-pane -t ${tmux_session} -o \"cat >> '${transcript_path}'\"" >&2
fi

# Resolve the native session file (the engine's own structured record — full tool
# inputs/outputs our pane transcript truncates). The link lives beside the
# transcript (main repo, gitignored, reboot-safe); archive-session.sh copies at LAND.
#
# claude: derive the project directory from the WORKTREE PATH — its store is keyed
# by cwd, so the mapping is exact. The earlier marker method ("newest file in the
# store") matched the CONDUCTOR'S OWN live session, which is always the most
# recently written file; two links pointed at the wrong sessions before this.
# codex: the store is date-keyed rollouts with no cwd in the name, so keep the
# marker, but require the candidate to NAME this worktree in its head — a
# concurrent dispatch cannot cross-match a file that records a different cwd.
native_session_file=""
case "$engine" in
  claude)
    claude_project_directory="$HOME/.claude/projects/$(printf '%s' "$worktree_path" | tr '/.' '--')"
    # Claude creates the cwd-derived project directory lazily. Wait on that condition for the same
    # bounded window as the transcript check. An immediate lookup warned during healthy launches.
    claude_session_deadline=$((SECONDS + 15))
    until [ -n "$native_session_file" ] || [ "$SECONDS" -ge "$claude_session_deadline" ]; do
      native_session_file="$(ls -t "$claude_project_directory"/*.jsonl 2>/dev/null | head -1 || true)"
      [ -n "$native_session_file" ] || sleep 1
    done
    ;;
  codex)
    for candidate in $(find "$native_session_store" -type f -newer "$native_session_marker" 2>/dev/null); do
      if head -c 8000 "$candidate" | grep -q "worktrees/${name}"; then
        native_session_file="$candidate"
        break
      fi
    done
    ;;
esac
rm -f "$native_session_marker"
session_link_path="${repository_root}/tmp/transcripts/session-link-${name}.txt"
if [ -n "$native_session_file" ]; then
  echo "$native_session_file" > "$session_link_path"
else
  echo "dispatch: WARNING — no native session file appeared in ${native_session_store} after launch" >&2
  echo "UNRESOLVED — no engine session file appeared after launch" > "$session_link_path"
fi

# The opening turn goes through `send`, which confirms it submitted.
# The report is born in its durable home — the task folder in the MAIN checkout — so
# delivery needs no copy step and survives a reboot (/tmp does not). The builder only
# creates a new untracked file there; the conductor stays the only committer.
report_home="${repository_root}/.invar/tasks/in-progress/${name}/report-${name}.md"
AGENT_TMUX_PREFIX="invar/" bash "${repository_root}/.claude/skills/agent-tmux/scripts/agent-tmux.sh" send "$name" \
  "Read TASK.md in this directory and execute it fully. Write your READY report to ${report_home} (absolute path, outside your worktree — create only that file there). If that directory does not exist when you finish, write to /tmp/${name}-READY.md instead and say so in the report." >/dev/null


echo
# The generated views were regenerated and committed WITH the record in step 4.
echo "dispatch: LAUNCHED #${task_number} ${slug}"
echo "  attach:     tmux attach -t ${tmux_session}"
echo "  monitor:    confirm fleet-watch is armed (TaskList); if missing:"
echo "              Monitor(command: bash scripts/fleet/fleet-watch.sh, persistent: true)"
echo "  transcript: ${transcript_path}"
echo "  worktree:   ${worktree_path}"
echo "  report to:  ${report_home}"
