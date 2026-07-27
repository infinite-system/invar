import { describe, expect, test } from 'bun:test';
import { Files } from '../system/Files';
import { AgentPromptResolver } from './AgentPromptResolver';

class TestAgentPromptResolver extends AgentPromptResolver.$Class {
  static description(instruction: string): string {
    return this.frontmatterDescription(instruction);
  }
}

describe('AgentPromptResolver', () => {
  describe('frontmatter description scalars', () => {
    const scalarCases = [
      {
        name: 'plain',
        scalar: 'description: plain text',
        expected: 'plain text',
      },
      {
        name: 'folded',
        scalar: 'description: >\n  folded text\n  across lines',
        expected: 'folded text across lines\n',
      },
      {
        name: 'folded strip',
        scalar: 'description: >-\n  folded text\n  across lines',
        expected: 'folded text across lines',
      },
      {
        name: 'folded keep',
        scalar: 'description: >+\n  folded text\n',
        expected: 'folded text\n\n',
      },
      {
        name: 'folded explicit indentation',
        scalar: 'description: >2-\n  folded text\n  across lines',
        expected: 'folded text across lines',
      },
      {
        name: 'literal',
        scalar: 'description: |\n  literal text\n  across lines',
        expected: 'literal text\nacross lines\n',
      },
      {
        name: 'literal strip',
        scalar: 'description: |-\n  literal text\n  across lines',
        expected: 'literal text\nacross lines',
      },
      {
        name: 'literal keep',
        scalar: 'description: |+\n  literal text\n',
        expected: 'literal text\n\n',
      },
      {
        name: 'literal explicit indentation',
        scalar: 'description: |2-\n  literal text\n  across lines',
        expected: 'literal text\nacross lines',
      },
      {
        name: 'double quoted',
        scalar: 'description: "double quoted text"',
        expected: 'double quoted text',
      },
      {
        name: 'double quoted with an escaped quote',
        scalar: 'description: "say \\"hello\\""',
        expected: 'say "hello"',
      },
      {
        name: 'single quoted',
        scalar: "description: 'single quoted text'",
        expected: 'single quoted text',
      },
      {
        name: 'single quoted with an escaped quote',
        scalar: "description: 'it''s quoted'",
        expected: "it's quoted",
      },
      {
        name: 'empty',
        scalar: 'description:',
        expected: '',
      },
    ] as const;

    for (const scalarCase of scalarCases) {
      test(`reads ${scalarCase.name} scalar`, () => {
        expect(
          TestAgentPromptResolver.description(
            `---\n${scalarCase.scalar}\n---\nBody.`,
          ),
        ).toBe(scalarCase.expected);
      });
    }

    test('returns empty when the description field is missing', () => {
      expect(
        TestAgentPromptResolver.description(
          '---\nname: missing-description\n---\nBody.',
        ),
      ).toBe('');
    });
  });

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
