# 231 — agent-tmux launch and list defects: three from #215's scratch drives

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: verification-integrity

## Outline

Bycatch of #215, three defects in one instrument
(`.claude/skills/agent-tmux/scripts/agent-tmux.sh`), each reproduced there:

1. **`list` fails under the production prefix.** `AGENT_TMUX_PREFIX=invar/`
   breaks `sed` — the slash is its delimiter. Exit 1 twice; an isolated
   prefix without a slash exits 0. Every fleet session uses `invar/`, so
   `list` has been broken in production the whole time and nothing noticed
   (nothing calls it — which is its own finding).
2. **Claude trust-dialog vocabulary drift.** Claude 2.1.220 asks "Is this a
   project you created or one you trust?"; `_dismiss` matches `Do you trust`,
   so launch hangs at the dialog in an untrusted directory. Reproduced twice.
   Worth keying on the dialog's structure, not its wording — wording drifted
   once already.
3. **Codex trust-dialog false ready.** The dialog's selected option starts
   with `›`, and `READY_RE='^›'` matches it, so launch reports ready before
   trust is accepted. One sighting; the trusted relaunch skips the dialog.

Fixes 2 and 3 share a generator: "ready" and "dismissable dialog" are both
being read from strings an engine can change. Prefer one structural detector
per engine over three regexes. Positive controls both ways for each fix
(#215's test file in `.claude/skills/agent-tmux/` is now self-contained; add
arms there).

## Invariants in scope

None — this is conductor tooling outside the contract layer. Refute if the
skill docs claim otherwise.

## Bycatch expected

Per AGENTS.md's taxonomy, all seven categories. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- `report-215-...md` in #215's folder, Bycatch (exact reproductions).
