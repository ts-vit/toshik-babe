import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

/** Row shape returned from the conversations table. */
export interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/** Input for creating a new conversation. */
export interface CreateConversationInput {
  id?: string;
  title: string;
}

/**
 * Data-access object for the `conversations` table.
 */
export class ConversationsDao {
  constructor(private readonly db: Database) {}

  /** Create a new conversation and return it. */
  create(input: CreateConversationInput): ConversationRow {
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare<void, [string, string, string, string]>(
        "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(id, input.title, now, now);

    return { id, title: input.title, created_at: now, updated_at: now };
  }

  /** Get a conversation by id. Returns null if not found. */
  getById(id: string): ConversationRow | null {
    return (
      this.db
        .query<ConversationRow, [string]>(
          "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?",
        )
        .get(id) ?? null
    );
  }

  /**
   * List conversations ordered by updated_at DESC.
   * @param limit  max rows to return (default 50)
   * @param offset skip first N rows (default 0)
   */
  list(limit = 50, offset = 0): ConversationRow[] {
    return this.db
      .query<ConversationRow, [number, number]>(
        "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT ? OFFSET ?",
      )
      .all(limit, offset);
  }

  /** Update a conversation's title (and bump updated_at). Returns the updated row or null. */
  update(id: string, title: string): ConversationRow | null {
    const now = new Date().toISOString();
    const changes = this.db
      .prepare<void, [string, string, string]>(
        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
      )
      .run(title, now, id);

    if ((changes as unknown as { changes: number }).changes === 0) return null;

    return this.getById(id);
  }

  /** Delete a conversation by id. Returns true if a row was deleted. */
  delete(id: string): boolean {
    const result = this.db
      .prepare<void, [string]>("DELETE FROM conversations WHERE id = ?")
      .run(id);

    return (result as unknown as { changes: number }).changes > 0;
  }
}
