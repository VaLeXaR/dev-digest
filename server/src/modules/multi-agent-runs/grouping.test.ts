import { describe, it, expect } from 'vitest';
import { groupCrossAgent, titlesSimilar, type CrossAgentFindingInput } from './grouping.js';

let counter = 0;
function makeFinding(overrides: Partial<CrossAgentFindingInput> = {}): CrossAgentFindingInput {
  counter += 1;
  return {
    agentId: 'agent-a',
    findingId: `finding-${counter}`,
    file: 'src/example.ts',
    startLine: 10,
    endLine: 12,
    severity: 'WARNING',
    title: 'Test finding',
    ...overrides,
  };
}

describe('groupCrossAgent', () => {
  it('merges overlapping + essence-similar findings in the same file into one group', () => {
    const findings = [
      makeFinding({
        agentId: 'agent-a',
        startLine: 10,
        endLine: 15,
        title: 'Unvalidated webhook URL allows SSRF',
      }),
      makeFinding({
        agentId: 'agent-b',
        startLine: 13,
        endLine: 18,
        title: 'SSRF via unvalidated webhook URL to internal network',
      }),
    ];
    const groups = groupCrossAgent(findings, ['agent-a', 'agent-b']);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.lineStart).toBe(10);
    expect(groups[0]!.lineEnd).toBe(18);
  });

  it('keeps overlapping but essence-DISSIMILAR findings as separate groups (overrides N3)', () => {
    const findings = [
      makeFinding({
        agentId: 'agent-a',
        startLine: 10,
        endLine: 14,
        title: 'Unvalidated webhook URL allows SSRF',
      }),
      makeFinding({
        agentId: 'agent-b',
        startLine: 11,
        endLine: 13,
        title: 'Missing rate limit on public endpoint',
      }),
    ];
    const groups = groupCrossAgent(findings, ['agent-a', 'agent-b']);
    expect(groups).toHaveLength(2);
    // Each distinct issue keeps its own title rather than collapsing under one.
    expect(groups.map((g) => g.title).sort()).toEqual([
      'Missing rate limit on public endpoint',
      'Unvalidated webhook URL allows SSRF',
    ]);
  });

  it('keeps a non-overlapping range in the same file as a separate group', () => {
    const findings = [
      makeFinding({ agentId: 'agent-a', startLine: 10, endLine: 12 }),
      makeFinding({ agentId: 'agent-b', startLine: 50, endLine: 55 }),
    ];
    const groups = groupCrossAgent(findings, ['agent-a', 'agent-b']);
    expect(groups).toHaveLength(2);
  });

  it('reads did_not_flag for an agent that ran but has no finding anywhere', () => {
    const findings = [makeFinding({ agentId: 'agent-a', startLine: 10, endLine: 12 })];
    const groups = groupCrossAgent(findings, ['agent-a', 'agent-b']);
    expect(groups).toHaveLength(1);
    const verdictB = groups[0]!.verdicts.find((v) => v.agentId === 'agent-b');
    expect(verdictB).toEqual({ agentId: 'agent-b', state: 'did_not_flag', severity: null, findingId: null });
    const verdictA = groups[0]!.verdicts.find((v) => v.agentId === 'agent-a');
    expect(verdictA?.state).toBe('flagged');
  });

  it('is a conflict only when at least one agent flagged and at least one ran-but-did-not-flag', () => {
    const oneFlagsOneDoesnt = groupCrossAgent(
      [makeFinding({ agentId: 'agent-a', startLine: 10, endLine: 12 })],
      ['agent-a', 'agent-b'],
    );
    expect(oneFlagsOneDoesnt[0]!.isConflict).toBe(true);

    const bothFlag = groupCrossAgent(
      [
        makeFinding({ agentId: 'agent-a', startLine: 10, endLine: 12 }),
        makeFinding({ agentId: 'agent-b', startLine: 10, endLine: 12 }),
      ],
      ['agent-a', 'agent-b'],
    );
    expect(bothFlag[0]!.isConflict).toBe(false);
  });

  it('a group only lists a verdict per agent that ran, not every agent that ever flagged anything', () => {
    const findings = [makeFinding({ agentId: 'agent-a', startLine: 10, endLine: 12 })];
    const groups = groupCrossAgent(findings, ['agent-a']);
    expect(groups[0]!.verdicts).toHaveLength(1);
  });
});

describe('titlesSimilar', () => {
  it('treats the same issue phrased at different verbosity as similar', () => {
    expect(
      titlesSimilar('SSRF', 'Unvalidated webhook URL allows SSRF to internal network'),
    ).toBe(true);
    expect(
      titlesSimilar('N+1 query in user list endpoint', 'N+1 in the user list will bite the limiter'),
    ).toBe(true);
  });

  it('treats clearly-unrelated issues as dissimilar', () => {
    expect(
      titlesSimilar('Unvalidated webhook URL allows SSRF', 'Missing rate limit on public endpoint'),
    ).toBe(false);
  });

  it('falls back to similar when a title carries no usable token signal', () => {
    expect(titlesSimilar('', 'anything at all')).toBe(true);
    expect(titlesSimilar('the a of to', 'in on at by')).toBe(true);
  });
});
