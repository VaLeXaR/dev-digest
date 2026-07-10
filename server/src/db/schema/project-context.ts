import { pgTable, uuid, text, integer, primaryKey } from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { skills } from './skills';

// ============================================================ Project context attach refs

export const agentContextDocs = pgTable(
  'agent_context_docs',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.agentId, t.path] }) }),
);

export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.path] }) }),
);
