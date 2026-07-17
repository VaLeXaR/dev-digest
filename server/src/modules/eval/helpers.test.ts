import { describe, expect, it } from 'vitest';
import type { EvalRunBatchRecord } from '@devdigest/shared';
import { PRECISION_DIP_ALERT_PTS, buildRegressionAlert, buildTrendPoints } from './helpers.js';

function makeBatch(overrides: Partial<EvalRunBatchRecord> = {}): EvalRunBatchRecord {
  return {
    id: 'batch-1',
    owner_kind: 'agent',
    owner_id: 'agent-1',
    owner_version: 7,
    ran_at: '2026-05-29T09:14:00.000Z',
    recall: 0.82,
    precision: 0.91,
    citation_accuracy: 0.95,
    pass_count: 8,
    total_count: 10,
    cost_usd: 0.23,
    ...overrides,
  };
}

describe('buildRegressionAlert', () => {
  it('matches design/06: bold lead-in + cause + collateral movement', () => {
    // 0.93 -> 0.91 is a 2pt dip; recall & citation both up.
    expect(
      buildRegressionAlert({
        latestPrecision: 0.91,
        previousPrecision: 0.93,
        latestVersion: 7,
        recallDelta: 0.04,
        citationDelta: 0.01,
      }),
    ).toBe(
      'Precision dipped 2pts on v7 — more false positives slipped in. Recall and citation both up.',
    );
  });

  it('keeps a single " — " so splitAlert bolds only the lead-in', () => {
    const alert = buildRegressionAlert({
      latestPrecision: 0.8,
      previousPrecision: 0.9,
      latestVersion: 3,
      recallDelta: 0.02,
      citationDelta: 0.02,
    });
    expect(alert?.split(' — ')).toHaveLength(2);
  });

  it('describes mixed recall/citation movement individually', () => {
    expect(
      buildRegressionAlert({
        latestPrecision: 0.85,
        previousPrecision: 0.9,
        latestVersion: 5,
        recallDelta: 0.03,
        citationDelta: -0.02,
      }),
    ).toBe('Precision dipped 5pts on v5 — more false positives slipped in. Recall up, citation down.');
  });

  it('reports sub-point movement as flat', () => {
    expect(
      buildRegressionAlert({
        latestPrecision: 0.88,
        previousPrecision: 0.92,
        latestVersion: 4,
        recallDelta: 0.002, // rounds to 0 pts
        citationDelta: 0.001,
      }),
    ).toBe('Precision dipped 4pts on v4 — more false positives slipped in. Recall and citation flat.');
  });

  it('omits the collateral sentence when both deltas are unknown', () => {
    expect(
      buildRegressionAlert({
        latestPrecision: 0.85,
        previousPrecision: 0.9,
        latestVersion: 2,
        recallDelta: null,
        citationDelta: null,
      }),
    ).toBe('Precision dipped 5pts on v2 — more false positives slipped in.');
  });

  it('does not fire below the alert threshold', () => {
    expect(PRECISION_DIP_ALERT_PTS).toBe(2);
    expect(
      buildRegressionAlert({
        latestPrecision: 0.909,
        previousPrecision: 0.918, // ~1pt dip
        latestVersion: 7,
        recallDelta: 0.04,
        citationDelta: 0.01,
      }),
    ).toBeNull();
  });

  it('does not fire when precision improved', () => {
    expect(
      buildRegressionAlert({
        latestPrecision: 0.95,
        previousPrecision: 0.9,
        latestVersion: 8,
        recallDelta: 0,
        citationDelta: 0,
      }),
    ).toBeNull();
  });

  it('returns null when there is no previous batch to diff against', () => {
    expect(
      buildRegressionAlert({
        latestPrecision: 0.9,
        previousPrecision: null,
        latestVersion: 1,
        recallDelta: null,
        citationDelta: null,
      }),
    ).toBeNull();
  });
});

describe('buildTrendPoints', () => {
  it('carries owner_version onto the trend point', () => {
    const [point] = buildTrendPoints([makeBatch({ owner_version: 7 })]);
    expect(point?.owner_version).toBe(7);
  });

  it('passes a null metric through as null, never 0 (G2/G3)', () => {
    const [point] = buildTrendPoints([
      makeBatch({ recall: null, precision: null, citation_accuracy: null }),
    ]);
    expect(point?.recall).toBeNull();
    expect(point?.precision).toBeNull();
    expect(point?.citation_accuracy).toBeNull();
  });

  it('maps a total_count: 0 batch to pass_rate: null, never 0 (R10)', () => {
    const [point] = buildTrendPoints([makeBatch({ pass_count: 0, total_count: 0 })]);
    expect(point?.pass_rate).toBeNull();
  });

  it('computes pass_rate as pass_count / total_count when total_count > 0', () => {
    const [point] = buildTrendPoints([makeBatch({ pass_count: 3, total_count: 4 })]);
    expect(point?.pass_rate).toBe(0.75);
  });

  it('passes ran_at and cost_usd through verbatim', () => {
    const [point] = buildTrendPoints([
      makeBatch({ ran_at: '2026-05-29T09:14:00.000Z', cost_usd: 0.23 }),
    ]);
    expect(point?.ran_at).toBe('2026-05-29T09:14:00.000Z');
    expect(point?.cost_usd).toBe(0.23);
  });

  it('maps multiple batches in order', () => {
    const points = buildTrendPoints([
      makeBatch({ owner_version: 6 }),
      makeBatch({ owner_version: 7 }),
    ]);
    expect(points.map((p) => p.owner_version)).toEqual([6, 7]);
  });
});
