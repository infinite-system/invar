#!/usr/bin/env bash
# Engine-switch smoke (tier S) — drives the live provider switcher through the REAL panel path,
# hermetically: INVAR_AGENT_BACKEND=echo forces the local echo backend and INVAR_AGENT_ENGINES=claude,codex
# forces both engines "available" so the switcher is cyclable without a real claude/codex subprocess.
# Asserts: the mode line shows the current engine + a ⇄ affordance; Ctrl+E AND a click on the segment
# cycle claude⇄codex (frame-dump agentEngine flips) and inject a "— switched to X — context ported —"
# system note; and the CONTEXT PORTS — a fact stated before the switch reaches the new engine (the echo
# reply after the switch contains the ported-context preamble carrying it). Idle quiescence holds.
# IDENTITY (the frozen-'Claude' bug): the pane TITLE, the empty-transcript GREETING, and the assistant
# role LABELS all follow the ACTIVE engine live — a switch retitles the pane immediately, new replies
# are labeled by the new engine while history keeps the label of the engine that produced it, and a
# codex-provider boot greets as Codex (second launch section).
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
H="$DIR/tui-harness.sh"
ROOT="$(cd "$DIR/.." && pwd)"
S="smoke-agent-engine-$$"
FIX="${1:-$ROOT/fixtures}"
fail=0
f()   { "$H" field "$S" "$1"; }
chk() { if [ "$2" = "$3" ]; then echo "  PASS  $1 ($2)"; else echo "  FAIL  $1: got '$2' want '$3'"; fail=1; fi; }
has() { if "$H" capture "$S" | grep -qF "$2"; then echo "  PASS  $1"; else echo "  FAIL  $1 (no '$2' in pane)"; "$H" capture "$S" | tail -16; fail=1; fi; }
# An assistant ROLE-LABEL row: the engine name alone on a transcript line (gutter + name + padding to the
# border) — never matched by the name appearing inside reply text or the box title.
has_label() { if "$H" capture "$S" | grep -qE "^│  $2 *│$"; then echo "  PASS  $1"; else echo "  FAIL  $1 (no '$2' label row)"; "$H" capture "$S" | tail -16; fail=1; fi; }

toggle_agent() { tmux send-keys -t "$S" -l "$(printf '\033[27;6;97~')"; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1; }
submit() { "$H" send "$S" -l "$1" >/dev/null; sleep 0.15; "$H" send "$S" Enter >/dev/null; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1; }
ctrl_e() { tmux send-keys -t "$S" -l "$(printf '\033[27;5;101~')"; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1; }

echo "== boot with the echo backend + two forced engines =="
# Per-run isolated HOME: the engine switch PERSISTS agentProvider via settings.save(), and the shared
# harness HOME would leak that across smoke runs (the persisted-HOME lesson).
RUN_HOME="$(mktemp -d)"
trap 'rm -rf "$RUN_HOME"; "$H" kill "$S" >/dev/null 2>&1' EXIT INT TERM
"$H" launch "$S" 110x34 env TUI_FRAME_DUMP=1 HOME="$RUN_HOME" INVAR_AGENT_BACKEND=echo INVAR_AGENT_ENGINES=claude,codex bun run src/main.ts "$FIX" >/dev/null
if "$H" ready "$S" 20 >/dev/null; then echo "  PASS  boot"; else echo "  FAIL  boot"; "$H" capture "$S"; exit 1; fi
toggle_agent
chk "agent pane open + focused" "$(f terminalFocused)" "true"

echo "== the mode line shows the engine segment + cycle affordance =="
chk "starting engine is claude" "$(f agentEngine)" "claude"
has "engine segment renders" "engine: claude"
has "cycle affordance renders" "⇄"
has "hint mentions ctrl+e" "ctrl+e"

echo "== IDENTITY at boot: title + greeting name the active engine (Claude) =="
chk "pane title is Claude" "$(f agentTitle)" "Claude"
has "box title renders Claude" "╭─Claude"
has "greeting names Claude" "Ask Claude anything"

echo "== establish a fact on engine A, then Ctrl+E cycles to engine B + injects the system note =="
submit "Please remember this token for later: MAGENTA-8842."
chk "engine still claude before switch" "$(f agentEngine)" "claude"
has_label "the reply is labeled Claude (producing engine)" "Claude"
ctrl_e
chk "Ctrl+E switched the engine to codex" "$(f agentEngine)" "codex"
has "the switch system note renders" "switched to codex"
has "the note says context ported" "context ported"
has "mode line now shows codex" "engine: codex"

echo "== IDENTITY follows the switch LIVE: title retitles NOW; history keeps its producer's label =="
chk "pane title flipped to Codex" "$(f agentTitle)" "Codex"
has "box title renders Codex" "╭─Codex"
has_label "the pre-switch reply STAYS labeled Claude (history)" "Claude"

echo "== the CONTEXT PORTS: the fact carries into the new engine's next turn =="
submit "What token did I ask you to remember?"
# The echo backend echoes what it RECEIVED — which now includes the ported-context preamble carrying the
# fact. Its presence proves the transcript context was serialized + prepended for the new engine.
has "the new engine received the ported-context preamble" "Context ported from the previous engine"
has "the ported context carried the fact" "MAGENTA-8842"
has_label "the post-switch reply is labeled Codex (new producer)" "Codex"

echo "== a CLICK on the engine segment also cycles (back to claude) =="
# Screen rows bottom-up: status bar (h-1), panel border (h-2), bottom pad (h-3), MODE LINE (h-4).
sb_h="$(f height)"; mode_y=$(( sb_h - 4 ))
"$H" click "$S" 4 "$mode_y" >/dev/null; sleep 0.3; "$H" settle "$S" >/dev/null 2>&1
chk "clicking the engine segment switched back to claude" "$(f agentEngine)" "claude"
has "second switch note renders" "switched to claude"

echo "== idle quiescence (no runaway frames) =="
"$H" settle "$S" >/dev/null 2>&1; i0="$(f frame)"; sleep 4; i1="$(f frame)"; d=$(( i1 - i0 ))
if [ "$d" -le 1 ]; then echo "  PASS  idle frame delta <= 1 over 4s (frame $i0 -> $i1)"; else echo "  FAIL  idle loop ticking: +$d"; fail=1; fi

echo "== BOOT-AS-CODEX: a codex provider greets, titles, and labels as Codex from the first frame =="
# The user's reported repro: settings/env say codex, yet every identity surface said 'Claude'. A fresh
# session forced to codex must say Codex EVERYWHERE before any switch happens.
"$H" kill "$S" >/dev/null 2>&1
S="smoke-agent-engine-codex-$$"
trap 'rm -rf "$RUN_HOME"; "$H" kill "$S" >/dev/null 2>&1' EXIT INT TERM
"$H" launch "$S" 110x34 env TUI_FRAME_DUMP=1 HOME="$RUN_HOME" INVAR_AGENT_BACKEND=echo INVAR_AGENT_PROVIDER=codex INVAR_AGENT_ENGINES=claude,codex bun run src/main.ts "$FIX" >/dev/null
if "$H" ready "$S" 20 >/dev/null; then echo "  PASS  codex boot"; else echo "  FAIL  codex boot"; "$H" capture "$S"; exit 1; fi
toggle_agent
chk "engine resolves to codex" "$(f agentEngine)" "codex"
chk "pane title is Codex at boot" "$(f agentTitle)" "Codex"
has "box title renders Codex" "╭─Codex"
has "greeting names Codex" "Ask Codex anything"
if "$H" capture "$S" | grep -qF "Ask Claude"; then echo "  FAIL  frozen 'Ask Claude' greeting under codex"; fail=1; else echo "  PASS  no frozen Claude greeting"; fi
submit "hello codex"
has_label "the reply is labeled Codex" "Codex"

echo "== RESULT: $([ "$fail" = 0 ] && echo ALL-PASS || echo FAILURES) =="
exit "$fail"
