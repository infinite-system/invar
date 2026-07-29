import { expect, test } from 'bun:test';
import { Files } from '../system/Files';
import { TerminalRcfile } from './TerminalRcfile';

test('bash shim sources user configuration before overriding prompt and metadata', () => {
  const contents = TerminalRcfile.Class.bashContents('#7aa2f7');
  expect(contents.indexOf('source "$HOME/.bashrc"')).toBeLessThan(
    contents.indexOf('PS1='),
  );
  expect(contents).toContain('PROMPT_COMMAND="__invar_emit_prompt_metadata"');
  expect(contents).toContain('\\e]7;file://');
  expect(contents).toContain('\\e]0;');
  expect(contents).toContain('\\e]133;A');
  expect(contents).toContain('\\e]133;B');
  expect(contents).toContain('\\e]133;C');
  expect(contents).toContain('\\e]133;D;%s');
  expect(contents).toContain('\\e[38;2;122;162;247m');
  expect(contents).toContain('$ ');
});

test('zsh shim sources user configuration before installing the themed prompt hook', () => {
  const contents = TerminalRcfile.Class.zshContents('#2e7de9');
  expect(contents.indexOf('source "$HOME/.zshrc"')).toBeLessThan(
    contents.indexOf('PROMPT='),
  );
  expect(contents).toContain(
    'add-zsh-hook precmd __invar_emit_prompt_metadata',
  );
  expect(contents).toContain(
    'add-zsh-hook preexec __invar_emit_command_output_start',
  );
  expect(contents).toContain('\\e]133;B');
  expect(contents).toContain('\\e]133;C');
  expect(contents).toContain('\\e]133;D;%s');
  expect(contents).toContain('\\e[38;2;46;125;233m');
});

test('create generates shell-specific launch configuration and cleans it up', () => {
  const handle = TerminalRcfile.Class.create('/bin/bash', '#7aa2f7');
  expect(handle).not.toBeNull();
  const rcfilePath = handle!.command[2]!;
  expect(Files.Class.exists(rcfilePath)).toBe(true);
  handle!.dispose();
  expect(Files.Class.exists(rcfilePath)).toBe(false);
  expect(TerminalRcfile.Class.create('/bin/fish', '#7aa2f7')).toBeNull();
});
