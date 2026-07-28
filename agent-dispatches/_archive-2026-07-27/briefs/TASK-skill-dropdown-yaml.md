# TASK — Skill dropdown: parse YAML block scalars, and ellipsize to one row (#127)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-skilldrop`
(branch `fix-skill-dropdown-yaml`, forked from latest main). Do NOT run `scripts/merge-gate.sh`;
do NOT push/merge/tag/delete branches — the conductor does that. Commit in the worktree and report
to `/tmp/skill-dropdown-READY.md`. Setup: `export PATH=$HOME/.bun/bin:$PATH; bun install
--frozen-lockfile`.

Another builder owns `src/modules/editor` (fold/scroll). Stay out of it.

## The user, verbatim

> "the skils dropdwon should ellipsis the long descriptions of the skill and not have >- in front"

## The mechanism — already located, do not re-hunt it

`AgentPromptResolver.frontmatterDescription` (`src/modules/agent/AgentPromptResolver.ts:102-112`)
scans frontmatter lines with:

```ts
const match = /^description:\s*(.*)$/.exec(line);
if (match) return (match[1] ?? '').trim();
```

When a skill writes its description as a YAML **block scalar** — which the repo's own skills do —

```yaml
description: >-
  A long description that wraps
  across several indented lines
```

the regex captures the *indicator* `>-` as the value, and the indented continuation lines are never
read at all. That is the `>-` the user sees. The label is then composed in
`AgentSkillPopup.item()` (`src/modules/agent/AgentSkillPopup.ts:157`) as
`` `/${skill.name}  ${skill.description}` `` with no width awareness, which is the second half.

The reduction: **the frontmatter reader is a line matcher pretending to be a YAML scalar reader.**
A scalar's value is not always on its own line, so a per-line regex cannot express it.

## Work item 1 — read the scalar, not the line

Handle the scalar forms YAML actually permits for `description:`:
- **plain** (`description: text`) — current behaviour, must keep working.
- **folded** `>` and **literal** `|`, each with optional chomping `-` / `+` (so `>-`, `>+`, `|-`,
  `|+`) and an optional explicit indentation digit. The value is the following block of lines
  indented more than the key; folded joins them with single spaces (blank line = paragraph break),
  literal preserves newlines. For the dropdown label, collapse whitespace either way — it renders
  on one row.
- **quoted** (`description: "text"` / `'text'`), including an escaped quote inside a double-quoted
  scalar.
- A missing/empty description stays empty, and the popup keeps its existing bare-`/name` label.

Do NOT add a YAML dependency for this. It is one field in a fixed shape; a small, explicit reader
is the right size, and a general parser would be machinery for a ghost. If you find the repo
already has a frontmatter reader elsewhere, USE IT rather than adding a second one — and say so in
the report. (House rule: one generator per behaviour.)

## Work item 2 — one row, ellipsized, width-aware

The dropdown row must never wrap or overflow its popup. Ellipsize the DESCRIPTION (never the
`/name`, which is what the user is selecting by) to fit the popup's usable width, with a single
trailing `…`.

Width must be measured the way the rest of the app measures it — through the existing width
authority, NOT `String.length`. Multi-cell glyphs and astral characters in a description must not
push the row over. Find how other truncating surfaces do it and reuse that; if there is no shared
truncation helper, extract one rather than writing a second inline slicer.

## Verification — drive the real user path, exact exit codes

- `bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
  `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
  `bun scripts/check-coverage-ratchet.ts`.
- Unit coverage for EACH scalar form above, including a `>-` description whose continuation lines
  carry the actual text — assert the label contains that text and does NOT contain `>-`.
- A DRIVEN smoke through the real PTY path: open the agent pane, type `/`, and assert on the
  rendered frame cells that (a) no row contains `>-` or `|-`, (b) a known long description is
  truncated with `…`, and (c) every popup row fits the popup width. Run it 3x, report all three
  exit codes.
- **Positive control, required**: the `>-` assertion must be able to fail. Point the catalog at a
  fixture skill whose description is a block scalar, run against the PRE-FIX parser, and show the
  red. A check that can only pass is not an instrument.
- Coverage declarations appended in the counted grammar.

## Rules

Full descriptive identifier names — no abbreviations (`index` not `i`). 80 columns. ivue
conventions: `Static()` / `Reactive()`, `protected` floor, `X.interface.ts`,
file-name-follows-class, never read `Class.prototype.<member>`, subclass `$Class` (never `Class`)
for test doubles. Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`;
leave the tree clean.
