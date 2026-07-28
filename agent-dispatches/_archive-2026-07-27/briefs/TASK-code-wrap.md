# TASK — Code-aware wrap: one break-opportunity generator, prose and code profiles

Branch: create `feat-code-aware-wrap` from `origin/main`.
Worktree: `/tmp/conductor-markdown`. Do not touch any other directory.

## What the user asked for

Verbatim: *"we implemented word level wrap for agent window, is our wrap inside editor also word level,
cause letter breakoffs look ugly?"*

So: the EDITOR's soft wrap currently breaks mid-word, and it should break at sensible opportunities like
the agent pane already does. The user's earlier related instruction for the agent pane was that words
must not be split *"unless only if it has - inbetween those words"*, which tells you hyphens are a
legitimate break opportunity to them.

## The load-bearing constraint: ONE generator, two profiles

The agent pane already solved word-boundary wrapping. Do NOT write a second wrapper for the editor. Find
the existing break-opportunity logic, extract it into ONE generator, and give it PROFILES:

- a PROSE profile (what the agent transcript wants: break at spaces and after hyphens);
- a CODE profile (what the editor wants).

If the editor and the agent pane end up with two independent implementations of "where may a line
break", this task has failed even if the rendering looks right. The tell to avoid: a consumer
re-implementing or suppressing part of the shared generator's behaviour.

## What a CODE profile should treat as a break opportunity

Reduce this yourself rather than copying a list, but the candidates worth considering are: whitespace;
after `-`, `_`, `/`, `\`, `.`, `,`, `;`, `:`; after an opening bracket and BEFORE a closing one; between
a lowercase-then-uppercase pair (camelCase); and around operators. State your chosen set and WHY in the
report — the point is that a long identifier or path breaks somewhere a reader expects, not mid-token.

Never break inside a grapheme cluster or between a surrogate pair; the repo already indexes by code
points (`Array.from`) rather than UTF-16 units and that must hold.

## Verification — by driving, not by measuring

Extend the PTY harness. Open a real fixture with (a) a long prose comment, (b) a very long
dotted/slashed path, (c) a long camelCase identifier, (d) a line of operators, each wider than the
viewport. Assert on OBSERVED CELLS that no wrapped row begins or ends mid-token where a legitimate
opportunity existed earlier in the row, and that the last visual row still reaches the true end of the
logical line.

Pair each assertion with a control proving the fixture line really was wider than the viewport —
otherwise a passing wrap assertion cannot be distinguished from a line that never needed wrapping.

Do NOT assert with clock-based waits or fixed sleeps. Use named grid conditions. The harness's wait
invariant now forbids a bare sleep between a drive and its assertion, and forbids a predicate the
pre-action state already satisfies; `assertContentInvariantAcrossAction` exists if you need "this region
held still while that one changed".

## House rules (non-negotiable)

- Full descriptive identifier names, no abbreviations. Name the STATE established, not the steps taken.
- Class-first ivue conventions: `Static()`/`Reactive()`, `protected` floor, late-read discipline, file
  name follows the class. `.prettierrc` (80 columns).
- Wrapping is a HOT PATH (it runs per visible row per frame). Do not allocate per character where a scan
  will do, and do not introduce an options object on the innermost function — `project.conventions.md`
  exempts hot paths from the ports-object rule for exactly this reason. Say in the report what you did to
  keep it cheap.
- Add/refine the invariant with ALL fields including **Scope**; verify with EXIT CODES, not a log tail.
  The invariant worth writing is about one break-opportunity generator serving every wrapped surface.
- Run and report exact exit codes: `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`,
  both invariant checker passes, `bash scripts/conventions-gate.sh`,
  `bun scripts/check-coverage-ratchet.ts`, and every smoke you touch three times.
- Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>` (use `-F`). Do NOT run
  the merge gate, push, merge, tag, or delete a branch — the conductor does that.
- Leave the worktree CLEAN; `git ls-files | grep '^TASK'` must return nothing.
- Report to `/tmp/code-wrap-READY.md`: where you drew the shared seam, the chosen break-opportunity set
  and why, the hot-path cost note, the driven evidence with its controls, and anything unproved.
