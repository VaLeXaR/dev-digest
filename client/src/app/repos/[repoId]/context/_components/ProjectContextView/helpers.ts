import type { DiscoveredDoc } from "@devdigest/shared";

/** Stable path-ascending sort so the list doesn't visibly reorder across
    refetches — a discovery re-scan's filesystem walk order is not guaranteed
    stable across runs, but `path` is unique per document. */
export function sortDocuments(documents: DiscoveredDoc[]): DiscoveredDoc[] {
  return [...documents].sort((a, b) => a.path.localeCompare(b.path));
}

/** Narrow rows by filename/path substring, case-insensitive. */
export function filterDocuments(documents: DiscoveredDoc[], query: string): DiscoveredDoc[] {
  const q = query.trim().toLowerCase();
  if (!q) return documents;
  return documents.filter((d) => d.path.toLowerCase().includes(q));
}

/** Locale-formatted scan timestamp, or null when never scanned / unparsable. */
export function formatScannedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString();
}
