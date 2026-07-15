import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/client';
import { reviews } from '../../db/schema';

export interface ReviewRow {
  id: string;
  workspaceId: string;
  repoId: string;
  prNumber: number;
  status: string;
}

export class ReviewsRepository {
  async findById(id: string, workspaceId: string): Promise<ReviewRow | null> {
    const row = await db.query.reviews.findFirst({
      where: and(eq(reviews.id, id), eq(reviews.workspaceId, workspaceId)),
    });
    return row ?? null;
  }

  async listForRepo(repoId: string, workspaceId: string): Promise<ReviewRow[]> {
    return db
      .select()
      .from(reviews)
      .where(and(eq(reviews.repoId, repoId), eq(reviews.workspaceId, workspaceId)))
      .orderBy(desc(reviews.createdAt));
  }

  async create(input: Omit<ReviewRow, 'id' | 'status'>): Promise<ReviewRow> {
    const [row] = await db.insert(reviews).values(input).returning();
    return row;
  }
}
