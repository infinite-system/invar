# Brief 488-1 — census core-to-plugin coupling, both forms

## In plain words

Core files still know plugin names, two ways: importing plugin modules,
and hardcoding plugin vocabulary (command ids like git.togglePanel,
kind strings, labels, category orders). Find every instance. Analysis
only: your product is an inventory report, zero code changes.

## Method

1. Define the tiers first, from the code: PLUGIN tier = every module
   whose contributor is registered in src/modules/plugins/DefaultPlugins.ts
   (read it; list the modules). CORE = everything else that is not a
   plugin's own folder.
2. Import census: for each plugin module, grep core for imports of it.
3. Vocabulary census: harvest each plugin's identifiers from its OWN
   source (command ids it registers, pane kind strings, labels,
   category names), then grep CORE for each. This catches what the
   import census cannot (ShortcutHelp names 'git' with zero imports).
4. Both arms per check: prove each grep can fire (it finds the known
   seeds in the task file) and can stay silent (a term no core file
   uses). A zero from an unproven grep is not a finding.
5. Classify every hit: file, line, plugin, form (import / command id /
   kind string / label / category / other), and the seam that removes
   it (contributor metadata, registry lookup, plugin-declared label).
6. Rank by blast radius: how many plugins does the same site couple to,
   and does the coupling block installing/removing a plugin cleanly.

## Deliverable

One report table, worst sites first, plus a short proposed decoupling
order that names which existing tasks cover which sites (#356 covers
the agent pane) and which sites need new tasks. No code edits.

## Invariants in scope

- The composition graph reaches every installed contributor
  ([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md)) — your census maps the
  territory this record guards; report if any coupling contradicts it.
- Check [src/modules/plugins/plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md) and
  [src/modules/app/app.invariants.md](../../../../src/modules/app/app.invariants.md); answer record by record.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy even when None observed.

## Instrument feedback

Report EASY / CONFUSING / MISSING about any tooling you used.

## Rules

- Analysis only: no source changes, no fixes, no merge-gate runs.
- Commit your report on your branch. READY report in the task folder.
