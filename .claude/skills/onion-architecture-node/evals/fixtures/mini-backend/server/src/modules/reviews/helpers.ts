import type { ReviewRow } from './repository';

export interface ReviewSummaryDto {
  id: string;
  pr: number;
  status: string;
}

export function mapReviewSummary(row: ReviewRow): ReviewSummaryDto {
  return { id: row.id, pr: row.prNumber, status: row.status };
}
