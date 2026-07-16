import { describe, expect, it } from 'vitest';
import { PRECISION_DIP_ALERT_PTS, buildRegressionAlert } from './helpers.js';

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
