---
name: ste-expression
description: Express yourself in Simplified Technical English (ASD-STE100, adapted for Invar). Applies to replies, briefs, task files, reports, and script messages — never to code. Use when writing any prose for this project, or when asked to make text plain.
---

# ste-expression — plain prose for Invar

Write short, direct sentences. The reader is busy and the text often steers an
agent. Adapted from ASD-STE100 (asd-ste100.org). Cross-model tests in the
source kit cut slop by 50-74% with these rules.

## Where each mode applies

| Text | Mode |
|---|---|
| Replies and status updates to the user | flavored |
| Briefs, task files, READY reports | flavored |
| Error messages and guard text in scripts | strict |
| Commit messages | flavored |
| Invariant records, lattice docs | exempt — they have their own form |
| Code, identifiers, commands | exempt — never touch |

## Rules (both modes)

WORDS
- One name for one thing. Do not rename an item mid-document.
- Use the short common word: start (not initiate), use (not utilize/leverage),
  help (not facilitate), make sure (not ensure), before (not prior to), about
  (not regarding), get (not obtain), show (not demonstrate), also (not
  additionally/furthermore).
- No marketing adjectives: seamless, robust, powerful, elegant, world-class.

VERBS
- Active voice. "The gate blocks the merge", not "the merge is blocked".
- A verb for an action. "Analyze the log", not "perform an analysis of the log".
- No hedging stacks. Not "it is important to note that this may help". Write
  "this helps X" or state the doubt plainly: "this may not hold at 500k".

SENTENCES
- One point per sentence. Aim under 20 words. Hard cap 25 in flavored mode.
- No semicolons. Write two sentences.
- Avoid the em dash. It is the top slop marker in our own output. One per
  paragraph at most. Prefer a period or a comma.

STRUCTURE
- One topic per paragraph, six sentences maximum.
- Steps go in a numbered list, one action per item, imperative form.
- Put the condition before the command: "If the gate is red, do not merge."

## Strict mode adds

- Hard cap 20 words per sentence.
- No contractions.
- Error messages name three things: what failed, why, what to do next.

## What the rules must never remove

Precision outranks brevity. Keep exact paths, exit codes, commit hashes,
counts, and names. Keep a needed 30-word constraint as one sentence if
splitting it changes the meaning. A brief that is plain but vague is worse
than a dense one that is exact.

## Self-check before returning text

1. Any sentence over the cap? Split it.
2. Any semicolon or stacked em dashes? Rewrite.
3. Passive voice with a known actor? Make it active.
4. "Perform an analysis" shapes? Use the verb.
5. The same thing under two names? Pick one.

## The linter

```
python3 .claude/skills/ste-expression/scripts/ste-lint.py <file.md>
```

Score is violations per 100 words. Lower is cleaner. Use it as a delta signal
on drafts, not as a gate. Under 2.0 is good for our documents. The conductor
lints briefs before dispatch. The linter skips code blocks and inline code.

The linter covers only the mechanical rules. It cannot judge whether a
sentence is true or exact. That part stays with the writer.
