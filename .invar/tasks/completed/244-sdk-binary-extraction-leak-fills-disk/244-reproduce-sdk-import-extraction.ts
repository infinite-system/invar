/**
 * This probe shows whether importing the Claude Agent SDK from a compiled Bun executable creates
 * an SDK extraction directory.
 *
 * Build and run it with:
 * bun build --compile .invar/tasks/active/244-sdk-binary-extraction-leak-fills-disk/244-reproduce-sdk-import-extraction.ts --outfile /tmp/244-sdk-import-reproduction
 * /tmp/244-sdk-import-reproduction
 *
 * Count `/tmp/.*.claude-agent-sdk*` directories immediately before and after the executable runs.
 * A count increase means module evaluation extracted an embedded SDK binary without starting a turn.
 */
import { query } from '@anthropic-ai/claude-agent-sdk';

process.stdout.write(
  `Claude Agent SDK import completed with query type ${typeof query}.\n`,
);
