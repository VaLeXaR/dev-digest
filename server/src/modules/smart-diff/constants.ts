import type { SmartDiffRole } from "@devdigest/shared";

export const BOILERPLATE_PATTERNS: RegExp[] = [
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.lock$/,
  /(^|\/)dist\//,
  /\.snap$/,
  /(^|\/)__snapshots__\//,
  /\.generated\./,
  /\.min\.js$/,
  /\.map$/,
  /\d+_.*\.sql$/,
];

export const WIRING_PATTERNS: RegExp[] = [
  /(^|\/)src\/server\.ts$/,
  /(^|\/)src\/index\.ts$/,
  /(^|\/)index\.ts$/,
  /(^|\/)config\.ts$/,
  /\/config\//,
  /(^|\/)routes\.ts$/,
  /(^|\/)router\.ts$/,
  /(^|\/)app\.ts$/,
  /(^|\/)main\.ts$/,
];

// Changed lines (additions + deletions) above this threshold -> split suggestion
export const LARGE_PR_THRESHOLD = 500;

export const ROLE_ORDER: SmartDiffRole[] = ["core", "wiring", "boilerplate"];

// Lines shown above/below a click-to-line navigation target that falls
// outside every rendered diff hunk (see SmartDiffService.getLineContext).
export const LINE_CONTEXT_RADIUS = 5;
