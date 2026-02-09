import type { Database } from "bun:sqlite";

/** Row shape returned from the attachments table. */
export interface AttachmentRow {
  id: string;
  message_id: string;
  type: string;
  name: string;
  file_path: string;
  created_at: string;
}

/** Input for creating a new attachment record. */
export interface CreateAttachmentInput {
  id: string;
  message_id: string;
  type: string;
  name: string;
  file_path: string;
}

/**
 * Data-access object for the `attachments` table.
 */
export class AttachmentsDao {
  constructor(private readonly db: Database) {}

  /** Create a new attachment record and return it. */
  create(input: CreateAttachmentInput): AttachmentRow {
    const now = new Date().toISOString();

    this.db
      .prepare<void, [string, string, string, string, string, string]>(
        "INSERT INTO attachments (id, message_id, type, name, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(input.id, input.message_id, input.type, input.name, input.file_path, now);

    return {
      id: input.id,
      message_id: input.message_id,
      type: input.type,
      name: input.name,
      file_path: input.file_path,
      created_at: now,
    };
  }

  /** List all attachments for a given message. */
  listByMessage(messageId: string): AttachmentRow[] {
    return this.db
      .query<AttachmentRow, [string]>(
        "SELECT id, message_id, type, name, file_path, created_at FROM attachments WHERE message_id = ? ORDER BY created_at ASC",
      )
      .all(messageId);
  }

  /** List all attachments for multiple message IDs at once. */
  listByMessages(messageIds: string[]): AttachmentRow[] {
    if (messageIds.length === 0) return [];
    const placeholders = messageIds.map(() => "?").join(", ");
    return this.db
      .query<AttachmentRow, string[]>(
        `SELECT id, message_id, type, name, file_path, created_at FROM attachments WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`,
      )
      .all(...messageIds);
  }

  /** Delete all attachments for a message. Returns number of deleted rows. */
  deleteByMessage(messageId: string): number {
    const result = this.db
      .prepare<void, [string]>(
        "DELETE FROM attachments WHERE message_id = ?",
      )
      .run(messageId);

    return (result as unknown as { changes: number }).changes;
  }
}
