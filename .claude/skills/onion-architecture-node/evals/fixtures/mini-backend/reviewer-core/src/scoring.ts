import type { Finding } from '../../server/src/vendor/shared/adapters';

const SEVERITY_WEIGHT: Record<Finding['severity'], number> = {
  low: 1,
  medium: 3,
  high: 8,
};

export function scoreFindings(findings: Finding[]): number {
  return findings.reduce((total, f) => total + SEVERITY_WEIGHT[f.severity], 0);
}

export function rankBySeverity(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity],
  );
}
