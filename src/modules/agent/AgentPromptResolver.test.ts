import { describe, expect, test } from 'bun:test';
import { Files } from '../system/Files';
import { AgentPromptResolver } from './AgentPromptResolver';

describe('AgentPromptResolver', () => {
  test('lists valid workspace skills in stable name order', () => {
    const workspaceRoot = Files.Class.createTemporaryDirectory(
      'invar-agent-skills-',
    );
    try {
      Files.Class.write(
        Files.Class.join(
          workspaceRoot,
          '.claude',
          'skills',
          'zebra',
          'SKILL.md',
        ),
        'No frontmatter.',
      );
      Files.Class.write(
        Files.Class.join(
          workspaceRoot,
          '.claude',
          'skills',
          'ivue',
          'SKILL.md',
        ),
        '---\ndescription: reactive guidance\n---\nUse ivue.',
      );

      expect(AgentPromptResolver.Class.skills(workspaceRoot)).toEqual([
        { name: 'ivue', description: 'reactive guidance' },
        { name: 'zebra', description: '' },
      ]);
    } finally {
      Files.Class.removeDirectory(workspaceRoot);
    }
  });

  test('resolves a project skill body before a same-named command and appends arguments', () => {
    const workspaceRoot =
      Files.Class.createTemporaryDirectory('invar-agent-skill-');
    try {
      Files.Class.write(
        Files.Class.join(
          workspaceRoot,
          '.claude',
          'skills',
          'ivue',
          'SKILL.md',
        ),
        '---\nname: ivue\ndescription: reactive guidance\n---\n\nUse ivue.',
      );
      Files.Class.write(
        Files.Class.join(workspaceRoot, '.claude', 'commands', 'ivue.md'),
        'Command fallback.',
      );

      expect(
        AgentPromptResolver.Class.resolve(
          workspaceRoot,
          '/ivue convert this model',
        ),
      ).toBe('Use ivue.\n\nconvert this model');
    } finally {
      Files.Class.removeDirectory(workspaceRoot);
    }
  });

  test('resolves a project command when no skill exists', () => {
    const workspaceRoot = Files.Class.createTemporaryDirectory(
      'invar-agent-command-',
    );
    try {
      Files.Class.write(
        Files.Class.join(workspaceRoot, '.claude', 'commands', 'review.md'),
        '---\ndescription: review changes\n---\n\nReview the current change.',
      );

      expect(
        AgentPromptResolver.Class.resolve(
          workspaceRoot,
          '/review focus on lifecycle',
        ),
      ).toBe('Review the current change.\n\nfocus on lifecycle');
    } finally {
      Files.Class.removeDirectory(workspaceRoot);
    }
  });

  test('passes an unknown slash invocation through unchanged', () => {
    const workspaceRoot = Files.Class.createTemporaryDirectory(
      'invar-agent-missing-',
    );
    try {
      const prompt = '/unknown  preserve these spaces  ';
      expect(AgentPromptResolver.Class.resolve(workspaceRoot, prompt)).toBe(
        prompt,
      );
    } finally {
      Files.Class.removeDirectory(workspaceRoot);
    }
  });

  test('refuses a path escape even when the escaped file remains inside the workspace', () => {
    const workspaceRoot = Files.Class.createTemporaryDirectory(
      'invar-agent-escape-',
    );
    try {
      Files.Class.write(
        Files.Class.join(workspaceRoot, '.claude', 'escaped', 'SKILL.md'),
        'This instruction is outside the skill root.',
      );
      const prompt = '/../escaped ARGUMENTANCHOR';

      expect(AgentPromptResolver.Class.resolve(workspaceRoot, prompt)).toBe(
        prompt,
      );
    } finally {
      Files.Class.removeDirectory(workspaceRoot);
    }
  });
});
