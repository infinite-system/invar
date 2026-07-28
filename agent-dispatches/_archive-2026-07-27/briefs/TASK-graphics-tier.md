# TASK — graphics tier must be a persisted SETTING, not an environment variable (#99)

Builder on Invar. Work ONLY in `/tmp/conductor-gfxtier` (branch `fix-graphics-tier-setting`, forked
from latest LOCAL `main`). No merge-gate, no push/tag/delete. Report to `/tmp/gfxtier-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile`.

## The requirement (user-requested, long-parked)

Graphics capability (Kitty/iTerm/sixel/none) is currently selected by an ENVIRONMENT VARIABLE. It
must be a persisted setting like every other capability the user controls: visible in Settings,
schema-contributed, persisted across restarts, and changeable live.

## Why this is not merely a refactor — the class

This is the same class as the nerd-font tier: **a capability the harness cannot probe needs either
the user's real terminal or a persisted DECLARATION.** Auto-detection can be wrong (it was, for
truecolor), and an env var is a declaration nobody can find, cannot change from inside the app, and
does not survive a restart. The setting IS the fix; keep any auto-detect as the DEFAULT VALUE only.

## Work

1. Find every read of the graphics-tier env var (`bun scripts/ast-query.ts` — parse, don't grep).
   Enumerate the consumers in your report; there may be more than the obvious one.
2. Add the schema-contributed setting (host capability, not a plugin) with the auto-detected tier as
   its DEFAULT. Persisted like the others; changing it live must take effect without restart —
   drive that, do not assume it.
3. The env var may remain as an OVERRIDE for harness/CI use, but it must not be the source of truth.
   Say in the report which precedence you chose and why.
4. Downgrade must be safe: switching to a lower tier while an image is displayed must not leave
   artifacts. Drive it.

## Verification — drive it

Driven smoke: open Settings, change the tier, assert the change takes effect on a real image/pixel
surface WITHOUT restart; restart the app in the same HOME and assert the choice persisted.
**Use a per-run `mktemp` HOME** (repo rule: the harness HOME is shared and persistent; a settings
smoke that reuses it leaks state between runs). Positive control required: prove the persistence
assertion can fail (e.g. skip the write, show the red).

Full checker suite ONCE at the end, exact exit codes. Drive-first per AGENTS.md Rule Zero; bycatch
rules apply. Full descriptive names, 80 cols, ivue conventions. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; clean tree.
