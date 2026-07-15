import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  repoId: uuid('repo_id').notNull(),
  prNumber: integer('pr_number').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const repos = pgTable('repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  fullName: text('full_name').notNull(),
  defaultBranch: text('default_branch').notNull().default('main'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
