# Brief — #287: the preview renders a Key: value stack as a stack, and H1 drops the underline

Read first: `.invar/tasks/in-progress/287-preview-renders-header-block-as-block/task-287-*.md`
— both user asks with the decision space.

Arm 1: a task file's `State:/Created:/Engine:` header stack renders as
ONE joined line. CommonMark joins single-newline lines — but these files
are first-class app content (walkable since #276). Choose the mechanism
HONESTLY and record it as a renderer semantic in the markdown record
(soft-break-as-break mode, a Key:-value block rule, or better — argued);
prose paragraphs must still reflow. Both polarities driven: stack stays
stacked, prose joins.

Arm 2 (user, verbatim): H1 should NOT be underlined — a different color
suffices. Both themes; H2+ unchanged unless consistency genuinely argues
(then say so). This refines the #236 stylesheet record — keep its label.

Drive with a real task file (they are the motivating content) and a
prose document; assert both behaviors in the settled frame. Positive
controls: revert each arm, red.

Lint this brief's own law: run
`bun scripts/tasks/lint-task-links.ts` on your report before READY (per
[AGENTS.md](../../../../AGENTS.md)).

## Invariants in scope

- The markdown renderer/stylesheet records (#236 family); the split
  record untouched.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: the chosen semantic argued + recorded, both arms driven
both polarities, controls quoted, links linted, green `bun test` +
markdown smokes. The conductor gates at landing.
