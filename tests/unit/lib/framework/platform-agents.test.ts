/**
 * The framework tier's platform agents (Hub t-142): the rubric judge's definition, and its
 * registration into core's platform-agent registry through the `lib/app/platform-agents.ts` bridge.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FRAMEWORK_PLATFORM_AGENTS,
  initFrameworkPlatformAgents,
} from '@/lib/framework/platform-agents';
import {
  FRAMEWORK_RUBRIC_JUDGE_AGENT,
  FRAMEWORK_RUBRIC_JUDGE_SLUG,
} from '@/lib/framework/facilitation/evaluation/rubric-judge';
import {
  CORE_PLATFORM_AGENTS,
  getPlatformAgent,
  listPlatformAgents,
  platformAgentsForOrg,
  __resetPlatformAgentsForTests,
} from '@/lib/orchestration/agents/platform-agents';

beforeEach(() => __resetPlatformAgentsForTests());

describe('the framework-rubric judge definition', () => {
  it('is a deterministic, knowledge-restricted judge every org gets', () => {
    expect(FRAMEWORK_RUBRIC_JUDGE_AGENT).toMatchObject({
      slug: 'eval-judge-framework-rubric',
      audience: 'every-org',
      agent: {
        kind: 'judge',
        temperature: 0.2,
        maxTokens: 1000,
        knowledgeAccessMode: 'restricted',
      },
      capabilities: [],
      knowledgeTags: [],
    });
  });

  it('keeps the slug the rubric scorer drives', () => {
    expect(FRAMEWORK_RUBRIC_JUDGE_SLUG).toBe(FRAMEWORK_RUBRIC_JUDGE_AGENT.slug);
  });

  it('pins the judge output contract the grader parses (score in 0–1, reasoning)', () => {
    const prompt = FRAMEWORK_RUBRIC_JUDGE_AGENT.agent.systemInstructions;
    expect(prompt).toContain('"score": <number from 0.0 to 1.0 inclusive>');
    expect(prompt).toContain('"reasoning"');
  });

  it('does not take a core slug', () => {
    const coreSlugs = new Set(CORE_PLATFORM_AGENTS.map((d) => d.slug));
    for (const definition of FRAMEWORK_PLATFORM_AGENTS) {
      expect(coreSlugs.has(definition.slug)).toBe(false);
    }
  });
});

describe('registration through the bridge', () => {
  it('lands after core’s definitions, and every org gets an instance', () => {
    const registered = listPlatformAgents();
    expect(registered.slice(0, CORE_PLATFORM_AGENTS.length)).toEqual(CORE_PLATFORM_AGENTS);
    expect(getPlatformAgent(FRAMEWORK_RUBRIC_JUDGE_SLUG)).toBe(FRAMEWORK_RUBRIC_JUDGE_AGENT);
    expect(platformAgentsForOrg('some-customer-org').map((d) => d.slug)).toContain(
      FRAMEWORK_RUBRIC_JUDGE_SLUG
    );
  });

  it('passes core’s registration checks and is idempotent', () => {
    listPlatformAgents();
    const before = listPlatformAgents().length;
    expect(() => initFrameworkPlatformAgents()).not.toThrow();
    expect(listPlatformAgents()).toHaveLength(before);
  });
});
