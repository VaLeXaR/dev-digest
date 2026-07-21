/** Cost in USD (e.g. "$0.0013", "$0.14"). Returns "—" when null. */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd === 0) return "$0.00";
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumSignificantDigits: 2,
    maximumSignificantDigits: 3,
  });
}

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}
