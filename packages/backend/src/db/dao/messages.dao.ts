import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

/** Row shape returned from the messages table. */
export interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  timestamp: string;
  tokens: number | null;
}

/** Input for creating a new message. */
export interface CreateMessageInput {
  id?: string;
  conversation_id: string;
  role: string;
  content: string;
  tokens?: number | null;
}

/**
 * Data-access object for the `messages` table.
 */
export class MessagesDao {
  constructor(private readonly db: Database) {}

  /** Create a new message and return it. */
  create(input: CreateMessageInput): MessageRow {
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    const tokens = input.tokens ?? null;

    this.db
      .prepare<void, [string, string, string, string, string, number | null]>(
        "INSERT INTO messages (id, conversation_id, role, content, timestamp, tokens) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, input.conversation_id, input.role, input.content, now, tokens);

    // Bump the parent conversation's updated_at.
    this.db
      .prepare<void, [string, string]>(
        "UPDATE conversations SET updated_at = ? WHERE id = ?",
      )
      .run(now, input.conversation_id);

    return {
      id,
      conversation_id: input.conversation_id,
      role: input.role,
      content: input.content,
      timestamp: now,
      tokens,
    };
  }

  /** Get a message by id. Returns null if not found. */
  getById(id: string): MessageRow | null {
    return (
      this.db
        .query<MessageRow, [string]>(
          "SELECT id, conversation_id, role, content, timestamp, tokens FROM messages WHERE id = ?",
        )
        .get(id) ?? null
    );
  }

  /**
   * List messages for a conversation, ordered by timestamp ASC.
   * @param conversationId  the parent conversation
   * @param limit           max rows (default 200)
   * @param offset          skip first N rows (default 0)
   */
  listByConversation(
    conversationId: string,
    limit = 200,
    offset = 0,
  ): MessageRow[] {
    return this.db
      .query<MessageRow, [string, number, number]>(
        "SELECT id, conversation_id, role, content, timestamp, tokens FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?",
      )
      .all(conversationId, limit, offset);
  }

  /** Delete a single message by id. Returns true if a row was deleted. */
  delete(id: string): boolean {
    const result = this.db
      .prepare<void, [string]>("DELETE FROM messages WHERE id = ?")
      .run(id);

    return (result as unknown as { changes: number }).changes > 0;
  }

  /** Delete all messages belonging to a conversation. Returns the number of deleted rows. */
  deleteByConversation(conversationId: string): number {
    const result = this.db
      .prepare<void, [string]>(
        "DELETE FROM messages WHERE conversation_id = ?",
      )
      .run(conversationId);

    return (result as unknown as { changes: number }).changes;
  }
}
